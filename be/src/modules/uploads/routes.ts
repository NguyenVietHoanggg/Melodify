import { Router } from 'express';
import { z } from 'zod';
import { sql } from '../../db/client';
import { paging } from '../../lib/dto';
import { pagingSchema, parse, requireUser } from '../../lib/http';
import { longText, text } from '../../lib/validation';
import { tracksInOrder } from '../catalog/repo';
import { createImageUpload } from '../media/service';
import { completeUpload, createUpload, deleteUpload, myUploads, updateUpload, uploadOptions } from './service';

export const uploadsRouter = Router();
const idParams = z.object({ id: z.guid() });

const meta = z.object({
  title: text(1, 200),
  artistName: text(0, 80).optional(),
  genre: z.string().max(30).nullable().optional(),
  moods: z.array(z.string().max(30)).max(3).optional(),
  visibility: z.enum(['public', 'private']),
  explicit: z.boolean().optional(),
  lyrics: longText(20000).nullable().optional(),
  coverPath: z.string().max(300).nullable().optional(),
});

uploadsRouter.get('/uploads/options', (_req, res) => {
  res.json(uploadOptions());
});

uploadsRouter.post('/uploads', async (req, res) => {
  const userId = requireUser(req);
  const body = parse(z.object({ fileName: z.string().min(1).max(255), size: z.number().int().positive(), mimeType: z.string().max(60) }), req.body);
  res.status(201).json(await createUpload(userId, body));
});

uploadsRouter.post('/uploads/cover-upload', async (req, res) => {
  const userId = requireUser(req);
  const { contentType } = parse(z.object({ contentType: z.string().max(40) }), req.body);
  res.json(await createImageUpload('upload-covers', userId, contentType));
});

uploadsRouter.post('/uploads/:id/complete', async (req, res) => {
  const userId = requireUser(req);
  const { id } = parse(idParams, req.params);
  res.json(await completeUpload(userId, id, parse(meta, req.body)));
});

uploadsRouter.patch('/uploads/:id', async (req, res) => {
  const userId = requireUser(req);
  const { id } = parse(idParams, req.params);
  res.json(await updateUpload(userId, id, parse(meta.partial(), req.body)));
});

uploadsRouter.delete('/uploads/:id', async (req, res) => {
  await deleteUpload(requireUser(req), parse(idParams, req.params).id);
  res.status(204).end();
});

uploadsRouter.get('/me/uploads', async (req, res) => {
  res.json({ items: await myUploads(requireUser(req)) });
});

/** The "Community" tab: everyone's public uploads, newest or most played. */
uploadsRouter.get('/community/tracks', async (req, res) => {
  const q = parse(pagingSchema.extend({ sort: z.enum(['new', 'popular']).default('new'), genre: z.string().max(30).optional() }), req.query);
  const where = sql`origin = 'upload' and visibility = 'public' and is_playable ${q.genre ? sql`and genre = ${q.genre}` : sql``}`;
  const [{ total } = { total: 0 }] = await sql<{ total: number }[]>`select count(*)::int as total from tracks where ${where}`;
  const rows = await sql<{ id: string }[]>`
    select id from tracks where ${where}
     order by ${q.sort === 'popular' ? sql`play_count desc, created_at desc` : sql`created_at desc`}
     limit ${q.limit} offset ${q.offset}`;
  res.json(paging(await tracksInOrder(rows.map((r) => r.id), req.userId), total, q.limit, q.offset));
});
