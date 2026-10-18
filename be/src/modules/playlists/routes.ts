import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { sql } from '../../db/client';
import { notFound, parse, requireUser } from '../../lib/http';
import { longText, text } from '../../lib/validation';
import { idParams } from '../catalog/routes';
import { getPlaylist, tracksInOrder } from '../catalog/repo';
import { createImageUpload, finalizeImage } from '../media/service';
import { autoTransition, buildRecipe, TRANSITION_PRESETS, type TransitionPreset } from '../music/transitions';
import { recommend } from '../reco/engine';
import {
  acceptInvite, addTracks, applySmartReorder, assertOwner, createInvite, createPlaylist, deletePlaylist,
  moveItem, removeCollaborator, removeItems, setMixEnabled, setTransition, updateDetails,
} from './service';

export const playlistsRouter = Router();

const ids = z.array(z.guid()).min(1).max(500);

playlistsRouter.post('/me/playlists', async (req, res) => {
  const userId = requireUser(req);
  const body = parse(z.object({ name: text(0, 200).optional(), description: longText(300).optional(), trackIds: ids.optional() }), req.body ?? {});
  const id = await createPlaylist(userId, body);
  res.status(201).json(await getPlaylist(id, userId));
});

playlistsRouter.patch('/playlists/:id', async (req, res) => {
  const userId = requireUser(req);
  const { id } = parse(idParams, req.params);
  const body = parse(
    z.object({
      name: text(1, 200).optional(),
      description: longText(300).nullable().optional(),
      isPublic: z.boolean().optional(),
      isCollaborative: z.boolean().optional(),
      /** Path returned by POST /playlists/:id/cover-upload after the browser uploaded the image. */
      coverPath: z.string().max(300).nullable().optional(),
    }),
    req.body,
  );
  let coverUrl: string | null | undefined;
  if (body.coverPath === null) coverUrl = null;
  else if (body.coverPath) {
    await assertOwner(id, userId);
    const img = await finalizeImage('playlist-covers', userId, body.coverPath);
    coverUrl = img.url;
    await sql`update playlists set dominant_color = ${img.color} where id = ${id}`;
  }
  await updateDetails(id, userId, { ...body, coverUrl });
  res.json(await getPlaylist(id, userId));
});

playlistsRouter.post('/playlists/:id/cover-upload', async (req, res) => {
  const userId = requireUser(req);
  const { id } = parse(idParams, req.params);
  const { contentType } = parse(z.object({ contentType: z.string().max(40) }), req.body);
  await assertOwner(id, userId);
  res.json(await createImageUpload('playlist-covers', userId, contentType));
});

playlistsRouter.delete('/playlists/:id', async (req, res) => {
  await deletePlaylist(parse(idParams, req.params).id, requireUser(req));
  res.status(204).end();
});

playlistsRouter.post('/playlists/:id/tracks', async (req, res) => {
  const userId = requireUser(req);
  const { id } = parse(idParams, req.params);
  const body = parse(z.object({ trackIds: ids, position: z.number().int().min(0).optional() }), req.body);
  const added = await addTracks(id, userId, body.trackIds, body.position);
  res.status(201).json({ added });
});

playlistsRouter.delete('/playlists/:id/tracks', async (req, res) => {
  const userId = requireUser(req);
  const { id } = parse(idParams, req.params);
  const body = parse(z.object({ itemIds: ids }), req.body);
  res.json({ removed: await removeItems(id, userId, body.itemIds) });
});

playlistsRouter.put('/playlists/:id/tracks/:itemId/position', async (req, res) => {
  const userId = requireUser(req);
  const { id, itemId } = parse(z.object({ id: z.guid(), itemId: z.guid() }), req.params);
  const { toIndex } = parse(z.object({ toIndex: z.number().int().min(0) }), req.body);
  await moveItem(id, userId, itemId, toIndex);
  res.status(204).end();
});

// ── Mix (Premium) ─────────────────────────────────────────────────────────────
playlistsRouter.put('/playlists/:id/mix', async (req, res) => {
  const userId = requireUser(req);
  const { id } = parse(idParams, req.params);
  const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body);
  await setMixEnabled(id, userId, enabled);
  res.json(await getPlaylist(id, userId));
});

playlistsRouter.put('/playlists/:id/tracks/:itemId/transition', async (req, res) => {
  const userId = requireUser(req);
  const { id, itemId } = parse(z.object({ id: z.guid(), itemId: z.guid() }), req.params);
  const body = parse(
    z.object({ preset: z.enum(TRANSITION_PRESETS as [string, ...string[]]), durationMs: z.number().int().min(500).max(20000) }).nullable(),
    req.body?.transition ?? null,
  );
  await setTransition(id, userId, itemId, body);
  res.status(204).end();
});

playlistsRouter.post('/playlists/:id/smart-reorder', async (req, res) => {
  const userId = requireUser(req);
  const { id } = parse(idParams, req.params);
  const { keepFirst } = parse(z.object({ keepFirst: z.boolean().default(true) }), req.body ?? {});
  res.json({ reordered: await applySmartReorder(id, userId, keepFirst) });
});

/** Preview a transition recipe between two tracks (the Mix editor draws its curves from this). */
playlistsRouter.get('/mix/recipe', async (req, res) => {
  const q = parse(
    z.object({
      from: z.guid(),
      to: z.guid(),
      preset: z.enum(['auto', ...TRANSITION_PRESETS] as [string, ...string[]]).default('auto'),
      durationMs: z.coerce.number().int().min(500).max(20000).optional(),
    }),
    req.query,
  );
  const rows = await sql<{ id: string; bpm: number | null; musicalKey: number | null; keyMode: number | null; energy: number | null }[]>`
    select id, bpm, musical_key, key_mode, energy from tracks where id in (${q.from}, ${q.to})`;
  const f = (id: string) => {
    const r = rows.find((x) => x.id === id);
    if (!r) throw notFound();
    return {
      id, bpm: r.bpm, energy: r.energy,
      key: r.musicalKey != null && (r.keyMode === 0 || r.keyMode === 1) ? { pitch: r.musicalKey, mode: r.keyMode as 0 | 1 } : null,
    };
  };
  const a = f(q.from);
  const b = f(q.to);
  const recipe = q.preset === 'auto'
    ? autoTransition(a, b)
    : buildRecipe(q.preset as TransitionPreset, q.durationMs ?? 8000, a, b, false);
  res.json(recipe);
});

// ── "Recommended songs — based on what's in this playlist" ──────────────────
playlistsRouter.get('/playlists/:id/recommendations', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { exclude, refresh } = parse(
    z.object({ exclude: z.string().optional(), refresh: z.coerce.number().int().min(0).default(0) }),
    req.query,
  );
  const [playlist, items] = await Promise.all([
    getPlaylist(id, req.userId),
    sql<{ trackId: string }[]>`select track_id from playlist_tracks where playlist_id = ${id} order by added_at desc limit 200`,
  ]);
  if (!playlist) throw notFound();
  const inPlaylist = items.map((r) => r.trackId);
  // A different handful of seeds per "Refresh" keeps suggestions moving.
  const seeds = inPlaylist.length > 20 ? inPlaylist.filter((_, i) => (i + refresh) % 3 !== 0).slice(0, 30) : inPlaylist;
  const excluded = [...inPlaylist, ...(exclude?.split(',').filter(Boolean) ?? [])];
  const recIds = seeds.length
    ? await recommend({ seedTrackIds: seeds, excludeTrackIds: excluded, userId: req.userId, limit: 10, maxPerArtist: 1, jitter: refresh ? 0.08 : 0 })
    : [];
  res.json({ items: await tracksInOrder(recIds, req.userId) });
});

// ── Collaboration ─────────────────────────────────────────────────────────────
playlistsRouter.post('/playlists/:id/invite', async (req, res) => {
  const userId = requireUser(req);
  const token = await createInvite(parse(idParams, req.params).id, userId);
  res.json({ token, url: `${env.WEB_ORIGIN}/invite/${token}` });
});

playlistsRouter.post('/playlist-invites/:token/accept', async (req, res) => {
  const userId = requireUser(req);
  const { token } = parse(z.object({ token: z.string().min(10).max(64) }), req.params);
  res.json({ playlistId: await acceptInvite(token, userId) });
});

playlistsRouter.delete('/playlists/:id/collaborators/:userId', async (req, res) => {
  const me = requireUser(req);
  const { id, userId } = parse(z.object({ id: z.guid(), userId: z.guid() }), req.params);
  await removeCollaborator(id, me, userId);
  res.status(204).end();
});
