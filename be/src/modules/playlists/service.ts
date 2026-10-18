import crypto from 'node:crypto';
import { sql } from '../../db/client';
import { badRequest, forbidden, notFound } from '../../lib/http';
import { getEntitlements } from '../billing/plans';
import { removeOwnedImage } from '../media/service';
import { DEFAULT_SETTINGS, getProduct } from '../users/service';
import { smartReorder, type MixFeatures } from '../music/reorder';

interface Access {
  ownerId: string | null;
  kind: string;
  isCollaborative: boolean;
  isCollaborator: boolean;
  mixEnabled: boolean;
}

async function access(playlistId: string, userId: string): Promise<Access> {
  const [row] = await sql<Access[]>`
    select p.owner_id, p.kind, p.is_collaborative, p.mix_enabled,
           exists(select 1 from playlist_collaborators c where c.playlist_id = p.id and c.user_id = ${userId}) as is_collaborator
      from playlists p where p.id = ${playlistId}`;
  if (!row) throw notFound();
  return row;
}

export async function assertCanEdit(playlistId: string, userId: string): Promise<Access> {
  const a = await access(playlistId, userId);
  if (a.ownerId === userId || (a.isCollaborative && a.isCollaborator)) return a;
  throw forbidden('playlist_not_editable');
}

export async function assertOwner(playlistId: string, userId: string): Promise<Access> {
  const a = await access(playlistId, userId);
  if (a.ownerId !== userId) throw forbidden('playlist_not_owner');
  return a;
}

/** "My Playlist #7" — Spotify numbers new playlists per user. */
export async function createPlaylist(userId: string, input: { name?: string; description?: string; trackIds?: string[] }) {
  // One statement = one round-trip, and still all-or-nothing: the playlist, its library entry and its songs.
  // Public or not follows the "publish new playlists on my profile" setting.
  const [p] = await sql<{ id: string }[]>`
    with created as (
      insert into playlists (owner_id, kind, name, description, is_public)
      select ${userId}, 'user',
             coalesce(${input.name?.trim() || null}, 'My Playlist #' || ((select count(*) from playlists where owner_id = ${userId}) + 1)),
             ${input.description ?? null},
             coalesce((select (settings ->> 'publishNewPlaylists')::boolean from profiles where id = ${userId}), ${DEFAULT_SETTINGS.publishNewPlaylists})
      returning id
    ), saved as (
      insert into library_items (user_id, item_type, item_id) select ${userId}, 'playlist', id from created
    ), items as (
      insert into playlist_tracks (playlist_id, track_id, position, added_by)
      select created.id, x.track_id, x.ord, ${userId}
        from created, unnest(${input.trackIds ?? []}::uuid[]) with ordinality as x(track_id, ord)
    )
    select id from created`;
  return p!.id;
}

export async function updateDetails(playlistId: string, userId: string, patch: { name?: string; description?: string | null; isPublic?: boolean; isCollaborative?: boolean; coverUrl?: string | null }) {
  await assertOwner(playlistId, userId);
  // (Joining the row to itself lets RETURNING show the cover from before the update.)
  const [old] = await sql<{ coverUrl: string | null }[]>`
    update playlists p set
      name             = coalesce(${patch.name ?? null}, p.name),
      description      = case when ${patch.description !== undefined} then ${patch.description ?? null} else p.description end,
      is_public        = coalesce(${patch.isPublic ?? null}, p.is_public),
      is_collaborative = coalesce(${patch.isCollaborative ?? null}, p.is_collaborative),
      cover_url        = case when ${patch.coverUrl !== undefined} then ${patch.coverUrl ?? null} else p.cover_url end
    from playlists prev
    where p.id = ${playlistId} and prev.id = p.id
    returning prev.cover_url`;
  if (patch.coverUrl !== undefined && old?.coverUrl !== patch.coverUrl) await removeOwnedImage('playlist-covers', userId, old?.coverUrl);
}

export async function deletePlaylist(playlistId: string, userId: string) {
  await assertOwner(playlistId, userId);
  const [p] = await sql<{ coverUrl: string | null }[]>`delete from playlists where id = ${playlistId} returning cover_url`;
  await removeOwnedImage('playlist-covers', userId, p?.coverUrl);
}

export async function addTracks(playlistId: string, userId: string, trackIds: string[], position?: number) {
  await assertCanEdit(playlistId, userId);
  if (position === undefined) {
    // Append (the usual case): lock, insert after the last item, touch — sent as one pipelined batch.
    // Separate statements on purpose: the insert must see songs a concurrent "add" committed while we waited for the lock.
    await sql.begin((tx) => [
      tx`select id from playlists where id = ${playlistId} for update`,
      tx`insert into playlist_tracks (playlist_id, track_id, position, added_by)
         select ${playlistId}, x.track_id,
                coalesce((select max(position) from playlist_tracks where playlist_id = ${playlistId}), 0) + x.ord, ${userId}
           from unnest(${trackIds}::uuid[]) with ordinality as x(track_id, ord)`,
      tx`update playlists set updated_at = now() where id = ${playlistId}`,
    ]);
    return trackIds.length;
  }
  return sql.begin(async (tx) => {
    // Lock the playlist row so two concurrent "add" calls can't compute the same positions.
    await tx`select id from playlists where id = ${playlistId} for update`;
    const [{ max } = { max: 0 }] = await tx<{ max: number }[]>`select coalesce(max(position), 0) as max from playlist_tracks where playlist_id = ${playlistId}`;
    let positions: number[];
    if (position === undefined) {
      positions = trackIds.map((_, i) => max + i + 1);
    } else {
      // Insert before the item currently at index `position`: spread new items between its neighbours.
      const around = await tx<{ position: number }[]>`
        select position from playlist_tracks where playlist_id = ${playlistId} order by position offset ${Math.max(0, position - 1)} limit 2`;
      const before = position === 0 ? 0 : (around[0]?.position ?? max);
      const after = position === 0 ? (around[0]?.position ?? 1) : (around[1]?.position ?? max + 1);
      const step = (after - before) / (trackIds.length + 1);
      positions = trackIds.map((_, i) => before + step * (i + 1));
    }
    await tx`insert into playlist_tracks ${tx(trackIds.map((trackId, i) => ({ playlistId, trackId, position: positions[i]!, addedBy: userId })))}`;
    await tx`update playlists set updated_at = now() where id = ${playlistId}`;
    return trackIds.length;
  });
}

export async function removeItems(playlistId: string, userId: string, itemIds: string[]) {
  await assertCanEdit(playlistId, userId);
  const [res] = await Promise.all([
    sql`delete from playlist_tracks where playlist_id = ${playlistId} and id = any(${itemIds}::uuid[])`,
    sql`update playlists set updated_at = now() where id = ${playlistId}`,
  ]);
  return res.count;
}

/**
 * Move one item to a new index. Fractional indexing: the item gets the average of its new neighbours'
 * positions — a single UPDATE instead of renumbering everything after it. When gaps get too small
 * (floating-point precision), we renumber the whole playlist once.
 */
export async function moveItem(playlistId: string, userId: string, itemId: string, toIndex: number) {
  await assertCanEdit(playlistId, userId);
  await sql.begin(async (tx) => {
    await tx`select id from playlists where id = ${playlistId} for update`;
    const others = await tx<{ id: string; position: number }[]>`
      select id, position from playlist_tracks where playlist_id = ${playlistId} and id <> ${itemId} order by position`;
    const before = toIndex > 0 ? others[toIndex - 1]?.position : undefined;
    const after = others[toIndex]?.position;
    const next = before === undefined ? (after ?? 1) - 1 : after === undefined ? before + 1 : (before + after) / 2;
    if (before !== undefined && after !== undefined && after - before < 1e-9) {
      const ordered = [...others.slice(0, toIndex).map((o) => o.id), itemId, ...others.slice(toIndex).map((o) => o.id)];
      const values = ordered.map((id, i) => [id, i + 1]);
      await tx`update playlist_tracks pt set position = (v.pos)::float8 from (values ${tx(values)}) as v(id, pos) where pt.id = (v.id)::uuid`;
    } else {
      await tx`update playlist_tracks set position = ${next} where id = ${itemId} and playlist_id = ${playlistId}`;
    }
    await tx`update playlists set updated_at = now() where id = ${playlistId}`;
  });
}

// ── Mix mode (Premium, owner only) ───────────────────────────────────────────
async function assertCanMix(playlistId: string, userId: string) {
  const a = await assertOwner(playlistId, userId);
  if (a.kind !== 'user' && a.kind !== 'ai') throw badRequest('mix_only_own_playlists');
  if (!getEntitlements(await getProduct(userId)).mix) throw badRequest('premium_required');
  return a;
}

export async function setMixEnabled(playlistId: string, userId: string, enabled: boolean) {
  await assertCanMix(playlistId, userId);
  await sql`update playlists set mix_enabled = ${enabled}, updated_at = now() where id = ${playlistId}`;
}

/** Save a custom transition from `itemId` into whatever track follows it now (or reset to Auto). */
export async function setTransition(playlistId: string, userId: string, itemId: string, t: { preset: string; durationMs: number } | null) {
  await assertCanMix(playlistId, userId);
  if (!t) {
    await sql`update playlist_tracks set transition = null where id = ${itemId} and playlist_id = ${playlistId}`;
    return;
  }
  const [next] = await sql<{ trackId: string }[]>`
    select n.track_id from playlist_tracks cur
      join playlist_tracks n on n.playlist_id = cur.playlist_id and n.position > cur.position
     where cur.id = ${itemId} and cur.playlist_id = ${playlistId}
     order by n.position limit 1`;
  if (!next) throw badRequest('no_next_track');
  await sql`
    update playlist_tracks set transition = ${sql.json({ preset: t.preset, durationMs: t.durationMs, nextTrackId: next.trackId })}
     where id = ${itemId} and playlist_id = ${playlistId}`;
}

/** Smart Reorder: reorder the whole playlist for the smoothest BPM/key/energy flow (see music/reorder.ts). */
export async function applySmartReorder(playlistId: string, userId: string, keepFirst: boolean) {
  await assertCanMix(playlistId, userId);
  const rows = await sql<{ itemId: string; trackId: string; bpm: number | null; musicalKey: number | null; keyMode: number | null; energy: number | null }[]>`
    select pt.id as item_id, t.id as track_id, t.bpm, t.musical_key, t.key_mode, t.energy
      from playlist_tracks pt join tracks t on t.id = pt.track_id
     where pt.playlist_id = ${playlistId} order by pt.position`;
  const items: (MixFeatures & { itemId: string })[] = rows.map((r) => ({
    id: r.trackId,
    itemId: r.itemId,
    bpm: r.bpm,
    key: r.musicalKey != null && (r.keyMode === 0 || r.keyMode === 1) ? { pitch: r.musicalKey, mode: r.keyMode as 0 | 1 } : null,
    energy: r.energy,
  }));
  const ordered = smartReorder(items, { keepFirst });
  if (ordered.length) {
    const values = ordered.map((it, i) => [it.itemId, i + 1]);
    await sql`update playlist_tracks pt set position = (v.pos)::float8, transition = null
                from (values ${sql(values)}) as v(id, pos) where pt.id = (v.id)::uuid`;
    await sql`update playlists set updated_at = now() where id = ${playlistId}`;
  }
  return ordered.length;
}

// ── Collaboration ────────────────────────────────────────────────────────────
export async function createInvite(playlistId: string, userId: string) {
  await assertOwner(playlistId, userId);
  const token = crypto.randomBytes(16).toString('base64url');
  await sql`update playlists set is_collaborative = true where id = ${playlistId}`;
  await sql`
    insert into playlist_invites (token, playlist_id, created_by, expires_at)
    values (${token}, ${playlistId}, ${userId}, now() + interval '7 days')`;
  return token;
}

export async function acceptInvite(token: string, userId: string) {
  const [inv] = await sql<{ playlistId: string; ownerId: string }[]>`
    select i.playlist_id, p.owner_id from playlist_invites i join playlists p on p.id = i.playlist_id
     where i.token = ${token} and i.expires_at > now()`;
  if (!inv) throw notFound('invite_expired');
  if (inv.ownerId !== userId) {
    await sql`insert into playlist_collaborators (playlist_id, user_id) values (${inv.playlistId}, ${userId}) on conflict do nothing`;
    await sql`insert into library_items (user_id, item_type, item_id) values (${userId}, 'playlist', ${inv.playlistId}) on conflict do nothing`;
  }
  return inv.playlistId;
}

export async function removeCollaborator(playlistId: string, userId: string, collaboratorId: string) {
  const a = await access(playlistId, userId);
  if (a.ownerId !== userId && collaboratorId !== userId) throw forbidden();
  await sql`delete from playlist_collaborators where playlist_id = ${playlistId} and user_id = ${collaboratorId}`;
}
