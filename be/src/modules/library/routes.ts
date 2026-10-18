import { Router } from 'express';
import { z } from 'zod';
import type { Track } from '../../contracts';
import { sql } from '../../db/client';
import { paging, toIso } from '../../lib/dto';
import { badRequest, pagingSchema, parse, requireUser } from '../../lib/http';
import { text } from '../../lib/validation';
import { TRACK_COLUMNS, TRACK_JOINS, visibleTo } from '../catalog/repo';
import { toTrack, type TrackRow } from '../catalog/dto';
import { getLibrary, removeItem, saveItem, setPinned, type LibrarySort } from './service';

export const libraryRouter = Router();

const itemRef = z.object({ type: z.enum(['playlist', 'album', 'artist', 'show']), id: z.guid() });

libraryRouter.get('/me/library', async (req, res) => {
  const userId = requireUser(req);
  const q = parse(
    z.object({
      filter: z.enum(['playlists', 'artists', 'albums', 'podcasts']).optional(),
      sort: z.enum(['recents', 'added', 'alpha', 'creator']).default('recents'),
      q: z.string().trim().max(100).optional(),
    }),
    req.query,
  );
  res.json({ items: await getLibrary(userId, { ...q, sort: q.sort as LibrarySort }) });
});

libraryRouter.put('/me/library', async (req, res) => {
  const userId = requireUser(req);
  const { type, id } = parse(itemRef, req.body);
  await saveItem(userId, type, id);
  res.status(204).end();
});

libraryRouter.delete('/me/library', async (req, res) => {
  const userId = requireUser(req);
  const { type, id } = parse(itemRef, req.body);
  await removeItem(userId, type, id);
  res.status(204).end();
});

/** Which of these items are in my library? (heart / "Saved" button states) */
libraryRouter.get('/me/library/contains', async (req, res) => {
  const userId = requireUser(req);
  const { type, ids } = parse(z.object({ type: z.enum(['playlist', 'album', 'artist', 'show']), ids: z.string().max(4000) }), req.query);
  const list = ids.split(',').filter(Boolean).slice(0, 100);
  const rows = await sql<{ itemId: string }[]>`
    select item_id from library_items where user_id = ${userId} and item_type = ${type} and item_id = any(${list}::uuid[])`;
  const saved = new Set(rows.map((r) => r.itemId));
  res.json(list.map((id) => saved.has(id)));
});

libraryRouter.put('/me/library/pin', async (req, res) => {
  const userId = requireUser(req);
  const body = parse(z.object({ type: z.enum(['playlist', 'album', 'artist', 'show', 'collection', 'folder']), id: z.guid(), pinned: z.boolean() }), req.body);
  await setPinned(userId, body.type, body.id, body.pinned);
  res.status(204).end();
});

libraryRouter.put('/me/library/taste', async (req, res) => {
  const userId = requireUser(req);
  const body = parse(itemRef.extend({ exclude: z.boolean() }), req.body);
  await sql`update library_items set exclude_from_taste = ${body.exclude} where user_id = ${userId} and item_type = ${body.type} and item_id = ${body.id}`;
  res.status(204).end();
});

// ── Folders ───────────────────────────────────────────────────────────────────
libraryRouter.post('/me/library/folders', async (req, res) => {
  const userId = requireUser(req);
  const { name } = parse(z.object({ name: text(1, 100).default('New Folder') }), req.body ?? {});
  const [f] = await sql<{ id: string }[]>`insert into library_folders (user_id, name) values (${userId}, ${name}) returning id`;
  res.status(201).json({ id: f!.id, name });
});

libraryRouter.patch('/me/library/folders/:id', async (req, res) => {
  const userId = requireUser(req);
  const { id } = parse(z.object({ id: z.guid() }), req.params);
  const { name } = parse(z.object({ name: text(1, 100) }), req.body);
  await sql`update library_folders set name = ${name} where id = ${id} and user_id = ${userId}`;
  res.status(204).end();
});

libraryRouter.delete('/me/library/folders/:id', async (req, res) => {
  const userId = requireUser(req);
  const { id } = parse(z.object({ id: z.guid() }), req.params);
  await sql`delete from library_folders where id = ${id} and user_id = ${userId}`;
  res.status(204).end();
});

libraryRouter.put('/me/library/folder', async (req, res) => {
  const userId = requireUser(req);
  const body = parse(itemRef.extend({ folderId: z.guid().nullable() }), req.body);
  if (body.folderId) {
    const [own] = await sql`select 1 from library_folders where id = ${body.folderId} and user_id = ${userId}`;
    if (!own) throw badRequest('folder_not_found');
  }
  await sql`update library_items set folder_id = ${body.folderId} where user_id = ${userId} and item_type = ${body.type} and item_id = ${body.id}`;
  res.status(204).end();
});

// ── Liked Songs ───────────────────────────────────────────────────────────────
libraryRouter.get('/me/tracks', async (req, res) => {
  const userId = requireUser(req);
  const { offset, limit } = parse(pagingSchema.extend({ limit: z.coerce.number().int().min(1).max(500).default(100) }), req.query);
  const [{ total, durationMs } = { total: 0, durationMs: 0 }] = await sql<{ total: number; durationMs: number }[]>`
    select count(*)::int as total, coalesce(sum(t.duration_ms), 0) as duration_ms
      from saved_tracks s join tracks t on t.id = s.track_id where s.user_id = ${userId}`;
  const rows = await sql<(TrackRow & { addedAt: Date })[]>`
    select s.added_at, ${TRACK_COLUMNS}
      from saved_tracks s join tracks t on t.id = s.track_id ${TRACK_JOINS}
     where s.user_id = ${userId} and ${visibleTo(userId)}
     order by s.added_at desc offset ${offset} limit ${limit}`;
  const items: (Track & { addedAt: string; itemId: string })[] = rows.map((r) => ({ ...toTrack(r), addedAt: toIso(r.addedAt)!, itemId: r.id }));
  res.json({ ...paging(items, total, limit, offset), durationMs });
});

libraryRouter.put('/me/tracks', async (req, res) => {
  const userId = requireUser(req);
  const { ids } = parse(z.object({ ids: z.array(z.guid()).min(1).max(100) }), req.body);
  await sql`insert into saved_tracks ${sql(ids.map((trackId) => ({ userId, trackId })))} on conflict do nothing`;
  res.status(204).end();
});

libraryRouter.delete('/me/tracks', async (req, res) => {
  const userId = requireUser(req);
  const { ids } = parse(z.object({ ids: z.array(z.guid()).min(1).max(100) }), req.body);
  await sql`delete from saved_tracks where user_id = ${userId} and track_id = any(${ids}::uuid[])`;
  res.status(204).end();
});

/** All liked track ids at once: lets the UI show the ✓ state of any row with an O(1) Set lookup. */
libraryRouter.get('/me/tracks/ids', async (req, res) => {
  const userId = requireUser(req);
  const rows = await sql<{ trackId: string }[]>`select track_id from saved_tracks where user_id = ${userId}`;
  res.json(rows.map((r) => r.trackId));
});

/** Everything saved/followed, keyed "type:id" (album:…, artist:…, playlist:…, show:…). */
libraryRouter.get('/me/library/ids', async (req, res) => {
  const userId = requireUser(req);
  const rows = await sql<{ itemType: string; itemId: string }[]>`
    select item_type, item_id from library_items where user_id = ${userId} and item_type <> 'collection'`;
  res.json(rows.map((r) => `${r.itemType}:${r.itemId}`));
});

libraryRouter.get('/me/tracks/contains', async (req, res) => {
  const userId = requireUser(req);
  const { ids } = parse(z.object({ ids: z.string().max(4000) }), req.query);
  const list = ids.split(',').filter(Boolean).slice(0, 100);
  const rows = await sql<{ trackId: string }[]>`
    select track_id from saved_tracks where user_id = ${userId} and track_id = any(${list}::uuid[])`;
  const saved = new Set(rows.map((r) => r.trackId));
  res.json(list.map((id) => saved.has(id)));
});

// ── Feedback: hide / snooze (30 days) / exclude from taste profile ──────────
libraryRouter.put('/me/tracks/:id/feedback', async (req, res) => {
  const userId = requireUser(req);
  const { id } = parse(z.object({ id: z.guid() }), req.params);
  const { kind } = parse(z.object({ kind: z.enum(['hide', 'snooze', 'exclude_taste']) }), req.body);
  const until = kind === 'snooze' ? sql`now() + interval '30 days'` : sql`null`;
  await sql`
    insert into track_feedback (user_id, track_id, kind, until) values (${userId}, ${id}, ${kind}, ${until})
    on conflict (user_id, track_id, kind) do update set until = excluded.until, created_at = now()`;
  res.status(204).end();
});

libraryRouter.delete('/me/tracks/:id/feedback', async (req, res) => {
  const userId = requireUser(req);
  const { id } = parse(z.object({ id: z.guid() }), req.params);
  const { kind } = parse(z.object({ kind: z.enum(['hide', 'snooze', 'exclude_taste']) }), req.query);
  await sql`delete from track_feedback where user_id = ${userId} and track_id = ${id} and kind = ${kind}`;
  res.status(204).end();
});

