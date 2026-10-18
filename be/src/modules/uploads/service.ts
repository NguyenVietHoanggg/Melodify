/**
 * User uploads (Melodify-only feature): anyone can publish their own music, public or private.
 * Uploaded tracks live in the same `tracks` table (origin = 'upload') so playlists, likes, the queue and
 * the player all work unchanged — but browse/recommendations keep them in their own "Community" space.
 *
 * Flow:  1. createUpload → signed URL      2. browser PUTs the file to Storage
 *        3. completeUpload → metadata, creator profile, cover, lyrics → playable
 *        4. background: audio analysis (BPM, key, energy…) → embedding (enables Mix & Smart Shuffle)
 */
import crypto from 'node:crypto';
import { parseBuffer } from 'music-metadata';
import type { Track } from '../../contracts';
import { sql } from '../../db/client';
import { headerColor } from '../../lib/colors';
import { badRequest, notFound } from '../../lib/http';
import { logger } from '../../lib/logger';
import { supabaseAdmin } from '../../lib/supabase';
import { getEntitlements } from '../billing/plans';
import { getTrack } from '../catalog/repo';
import { parseLrc } from '../lyrics/lrc';
import { finalizeImage, removeOwnedImage } from '../media/service';
import { analyzeAudio } from '../music/analysis';
import { MACRO_GENRES, MOOD_SPACE } from '../music/taxonomy';
import { featureVector, toPgVector } from '../reco/vector';
import { getProduct } from '../users/service';

const AUDIO_TYPES: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/ogg': 'ogg', 'audio/aac': 'aac', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
};

export const uploadOptions = () => ({ genres: [...MACRO_GENRES], moods: Object.keys(MOOD_SPACE), audioTypes: Object.keys(AUDIO_TYPES) });

export async function createUpload(userId: string, input: { fileName: string; size: number; mimeType: string }) {
  const ent = getEntitlements(await getProduct(userId));
  const ext = AUDIO_TYPES[input.mimeType];
  if (!ext) throw badRequest('unsupported_audio_type');
  if (input.size > ent.uploadMaxMb * 1024 * 1024) throw badRequest('file_too_large', undefined, { maxMb: ent.uploadMaxMb });
  const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`select count(*)::int as n from tracks where uploader_id = ${userId} and is_playable`;
  if (n >= ent.uploadTracksLimit) throw badRequest('upload_limit_reached', undefined, { limit: ent.uploadTracksLimit });

  const id = crypto.randomUUID();
  const path = `${userId}/${id}.${ext}`;
  const title = input.fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim().slice(0, 200) || 'Untitled';
  await sql`
    insert into tracks (id, provider, provider_id, origin, visibility, uploader_id, title, duration_ms, storage_path, is_playable, analysis_status)
    values (${id}, 'upload', ${id}, 'upload', 'private', ${userId}, ${title}, 1, ${path}, false, 'pending')`;
  const { data, error } = await supabaseAdmin.storage.from('uploads').createSignedUploadUrl(path);
  if (error || !data) throw badRequest('upload_unavailable', error?.message);
  return { uploadId: id, uploadUrl: data.signedUrl, maxBytes: ent.uploadMaxMb * 1024 * 1024 };
}

/** Every uploader gets one "creator" artist profile (like a SoundCloud account) that their tracks hang off. */
async function ensureCreatorArtist(userId: string, name: string | undefined) {
  const [p] = await sql<{ displayName: string; avatarUrl: string | null }[]>`select display_name, avatar_url from profiles where id = ${userId}`;
  const [a] = await sql<{ id: string }[]>`
    insert into artists (provider, provider_id, name, avatar_url, owner_id)
    values ('upload', ${userId}, ${name?.trim() || p?.displayName || 'Artist'}, ${p?.avatarUrl ?? null}, ${userId})
    on conflict (provider, provider_id) do update set name = coalesce(${name?.trim() || null}, artists.name)
    returning id`;
  return a!.id;
}

export interface UploadMeta {
  title: string;
  artistName?: string;
  genre?: string | null;
  moods?: string[];
  visibility: 'public' | 'private';
  explicit?: boolean;
  lyrics?: string | null;
  coverPath?: string | null;
}

async function storeLyrics(trackId: string, text: string | null | undefined) {
  if (text === undefined) return;
  if (!text?.trim()) {
    await sql`delete from lyrics where track_id = ${trackId}`;
    return;
  }
  const synced = parseLrc(text);
  const kind = synced.length >= 3 ? 'synced' : 'plain';
  const lines = kind === 'synced' ? synced : text.split(/\r?\n/).map((l) => ({ text: l }));
  await sql`
    insert into lyrics (track_id, kind, lines, provider) values (${trackId}, ${kind}, ${sql.json(lines as never)}, 'uploader')
    on conflict (track_id) do update set kind = excluded.kind, lines = excluded.lines, provider = excluded.provider, updated_at = now()`;
}

/** Background job: real audio analysis → features + embedding (so uploads can join Mix & Smart Shuffle). */
async function analyzeAndStore(trackId: string, bytes: Uint8Array) {
  try {
    const a = await analyzeAudio(bytes);
    const [t] = await sql<{ genre: string | null; releaseDate: string | null }[]>`select genre, release_date from tracks where id = ${trackId}`;
    const vector = featureVector({
      genre: t?.genre ?? null, energy: a.energy, valence: a.valence, danceability: a.danceability, acousticness: a.acousticness,
      instrumentalness: null, bpm: a.bpm, musicalKey: a.key?.pitch ?? null, keyMode: a.key?.mode ?? null,
      releaseDate: t?.releaseDate ?? null, popularity: 0,
    });
    await sql`
      update tracks set bpm = ${a.bpm}, musical_key = ${a.key?.pitch ?? null}, key_mode = ${a.key?.mode ?? null},
        energy = ${a.energy}, valence = ${a.valence}, danceability = ${a.danceability}, acousticness = ${a.acousticness},
        duration_ms = case when duration_ms <= 1 then ${a.durationMs} else duration_ms end,
        embedding = ${toPgVector(vector)}::extensions.vector, analysis_status = 'done'
      where id = ${trackId}`;
    logger.info({ trackId, bpm: a.bpm, key: a.key }, 'upload analysed');
  } catch (err) {
    logger.warn({ err, trackId }, 'upload analysis failed');
    await sql`update tracks set analysis_status = 'failed' where id = ${trackId}`;
  }
}

export async function completeUpload(userId: string, trackId: string, meta: UploadMeta): Promise<Track> {
  const [t] = await sql<{ storagePath: string; isPlayable: boolean }[]>`
    select storage_path, is_playable from tracks where id = ${trackId} and uploader_id = ${userId} and origin = 'upload'`;
  if (!t) throw notFound();
  const { data: blob, error } = await supabaseAdmin.storage.from('uploads').download(t.storagePath);
  if (error || !blob) throw badRequest('file_not_uploaded');
  const bytes = new Uint8Array(await blob.arrayBuffer());

  let durationMs = 0;
  let embedded: { data: Uint8Array; format: string } | null = null;
  try {
    const mm = await parseBuffer(bytes, { mimeType: blob.type || undefined, size: bytes.length });
    durationMs = Math.round((mm.format.duration ?? 0) * 1000);
    const pic = mm.common.picture?.[0];
    if (pic) embedded = { data: pic.data, format: pic.format };
  } catch {
    // not fatal: the audio analysis will measure the duration
  }

  const artistId = await ensureCreatorArtist(userId, meta.artistName);

  // Cover: an uploaded image wins, otherwise the artwork embedded in the file's ID3 tags.
  let coverUrl: string | null = null;
  let color: string | null = null;
  if (meta.coverPath) {
    const img = await finalizeImage('upload-covers', userId, meta.coverPath);
    coverUrl = img.url;
    color = img.color;
  } else if (embedded && /image\/(jpeg|png|webp)/.test(embedded.format)) {
    const path = `upload-covers/${userId}/${trackId}.${embedded.format.split('/')[1]}`;
    const up = await supabaseAdmin.storage.from('images').upload(path, embedded.data, { contentType: embedded.format, upsert: true });
    if (!up.error) {
      coverUrl = supabaseAdmin.storage.from('images').getPublicUrl(path).data.publicUrl;
      color = await headerColor(Buffer.from(embedded.data)).catch(() => null);
    }
  }

  const genre = meta.genre && (MACRO_GENRES as readonly string[]).includes(meta.genre) ? meta.genre : null;
  const moods = (meta.moods ?? []).filter((m) => m in MOOD_SPACE).slice(0, 3);
  await sql.begin(async (tx) => {
    const [album] = await tx<{ id: string }[]>`
      insert into albums (provider, provider_id, title, release_type, release_date, cover_url, dominant_color, origin)
      values ('upload', ${trackId}, ${meta.title}, 'single', current_date, ${coverUrl}, ${color}, 'upload')
      on conflict (provider, provider_id) do update set title = excluded.title,
        cover_url = coalesce(excluded.cover_url, albums.cover_url), dominant_color = coalesce(excluded.dominant_color, albums.dominant_color)
      returning id`;
    await tx`insert into album_artists (album_id, artist_id) values (${album!.id}, ${artistId}) on conflict do nothing`;
    await tx`
      update tracks set title = ${meta.title}, album_id = ${album!.id}, explicit = ${meta.explicit ?? false},
        genre = ${genre}, moods = ${moods}, visibility = ${meta.visibility}, release_date = current_date,
        duration_ms = ${durationMs > 0 ? durationMs : 1}, is_playable = true
      where id = ${trackId}`;
    await tx`insert into track_artists (track_id, artist_id) values (${trackId}, ${artistId}) on conflict do nothing`;
    // "Your Uploads" shows up in the library once you have one.
    await tx`insert into library_items (user_id, item_type, item_id) values (${userId}, 'collection', '00000000-0000-0000-0000-000000000003') on conflict do nothing`;
  });
  await storeLyrics(trackId, meta.lyrics);
  void analyzeAndStore(trackId, bytes);
  return (await getTrack(trackId, userId))!;
}

export async function updateUpload(userId: string, trackId: string, patch: Partial<UploadMeta>) {
  const [t] = await sql<{ albumId: string | null }[]>`select album_id from tracks where id = ${trackId} and uploader_id = ${userId}`;
  if (!t) throw notFound();
  const genre = patch.genre === undefined ? undefined : patch.genre && (MACRO_GENRES as readonly string[]).includes(patch.genre) ? patch.genre : null;
  const moods = patch.moods?.filter((m) => m in MOOD_SPACE).slice(0, 3);
  await sql`
    update tracks set
      title = coalesce(${patch.title ?? null}, title),
      visibility = coalesce(${patch.visibility ?? null}, visibility),
      explicit = coalesce(${patch.explicit ?? null}, explicit),
      genre = case when ${genre !== undefined} then ${genre ?? null} else genre end,
      moods = coalesce(${moods ?? null}::text[], moods)
    where id = ${trackId}`;
  if (patch.title && t.albumId) await sql`update albums set title = ${patch.title} where id = ${t.albumId}`;
  if (patch.coverPath && t.albumId) {
    const img = await finalizeImage('upload-covers', userId, patch.coverPath);
    const [old] = await sql<{ coverUrl: string | null }[]>`
      update albums a set cover_url = ${img.url}, dominant_color = ${img.color}
        from albums prev where a.id = ${t.albumId} and prev.id = a.id returning prev.cover_url`;
    if (old?.coverUrl !== img.url) await removeOwnedImage('upload-covers', userId, old?.coverUrl);
  }
  await storeLyrics(trackId, patch.lyrics);
  return getTrack(trackId, userId);
}

export async function deleteUpload(userId: string, trackId: string) {
  const [t] = await sql<{ storagePath: string | null; albumId: string | null }[]>`
    delete from tracks where id = ${trackId} and uploader_id = ${userId} returning storage_path, album_id`;
  if (!t) throw notFound();
  const [album] = t.albumId
    ? await sql<{ coverUrl: string | null }[]>`
        delete from albums where id = ${t.albumId} and origin = 'upload' and not exists (select 1 from tracks where album_id = ${t.albumId})
        returning cover_url`
    : [];
  // The audio file and the cover go too (Storage isn't covered by the database's ON DELETE CASCADE).
  await Promise.all([
    t.storagePath ? supabaseAdmin.storage.from('uploads').remove([t.storagePath]) : null,
    removeOwnedImage('upload-covers', userId, album?.coverUrl),
  ]);
}

export async function myUploads(userId: string) {
  const rows = await sql<{ id: string; analysisStatus: string }[]>`
    select id, analysis_status from tracks where uploader_id = ${userId} and is_playable order by created_at desc`;
  const tracks = await Promise.all(rows.map((r) => getTrack(r.id, userId)));
  return rows.map((r, i) => ({ track: tracks[i]!, analysisStatus: r.analysisStatus })).filter((x) => x.track);
}

/** Housekeeping: drop upload slots that were never completed (browser closed mid-upload). */
export async function cleanupAbandonedUploads() {
  const rows = await sql<{ storagePath: string }[]>`
    delete from tracks where origin = 'upload' and not is_playable and created_at < now() - interval '1 day' returning storage_path`;
  if (rows.length) await supabaseAdmin.storage.from('uploads').remove(rows.map((r) => r.storagePath));
}

/** Listeners can report uploads. Three open reports from different people hide it until an admin reviews it. */
export const REPORTS_TO_HIDE = 3;

export async function reportTrack(reporterId: string, trackId: string, reason: string, details?: string) {
  const [t] = await sql<{ uploaderId: string | null; visibility: string; title: string }[]>`
    select uploader_id, visibility, title from tracks where id = ${trackId} and origin = 'upload'`;
  if (!t) throw notFound();
  if (t.uploaderId === reporterId) throw badRequest('cannot_report_own_upload');
  await sql`
    insert into content_reports (reporter_id, track_id, reason, details) values (${reporterId}, ${trackId}, ${reason}, ${details ?? null})
    on conflict (reporter_id, track_id) do update set reason = excluded.reason, details = excluded.details, status = 'open', created_at = now()`;
  const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`
    select count(*)::int as n from content_reports where track_id = ${trackId} and status = 'open'`;
  if (n >= REPORTS_TO_HIDE && t.visibility === 'public') {
    await sql`update tracks set visibility = 'private' where id = ${trackId}`;
    await sql`insert into notifications (user_id, type, payload) values (${t.uploaderId}, 'upload_hidden', ${sql.json({ trackId, title: t.title })})`;
    logger.warn({ trackId, reports: n }, 'upload hidden after reports');
  }
}
