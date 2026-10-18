import { Router } from 'express';
import { z } from 'zod';
import { pagingSchema, parse, requireUser } from '../../lib/http';
import { getEpisodePage, getShowPage, savedEpisodeIds, savedEpisodes, saveEpisodes, setEpisodeProgress, showEpisodes } from './service';

export const podcastsRouter = Router();
const idParams = z.object({ id: z.guid() });
const idsBody = z.object({ ids: z.array(z.guid()).min(1).max(50) });

podcastsRouter.get('/shows/:id', async (req, res) => {
  res.json(await getShowPage(parse(idParams, req.params).id, req.userId));
});

podcastsRouter.get('/shows/:id/episodes', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const q = parse(pagingSchema.extend({ sort: z.enum(['newest', 'oldest']).default('newest') }), req.query);
  res.json(await showEpisodes(id, req.userId, q));
});

podcastsRouter.get('/episodes/:id', async (req, res) => {
  res.json(await getEpisodePage(parse(idParams, req.params).id, req.userId));
});

podcastsRouter.get('/me/episodes', async (req, res) => {
  const q = parse(pagingSchema, req.query);
  res.json(await savedEpisodes(requireUser(req), q.limit, q.offset));
});

podcastsRouter.put('/me/episodes', async (req, res) => {
  await saveEpisodes(requireUser(req), parse(idsBody, req.body).ids, true);
  res.status(204).end();
});

podcastsRouter.delete('/me/episodes', async (req, res) => {
  await saveEpisodes(requireUser(req), parse(idsBody, req.body).ids, false);
  res.status(204).end();
});

podcastsRouter.get('/me/episodes/contains', async (req, res) => {
  const { ids } = parse(z.object({ ids: z.string().transform((s) => s.split(',').filter(Boolean)).pipe(z.array(z.guid()).max(50)) }), req.query);
  res.json(await savedEpisodeIds(requireUser(req), ids));
});

podcastsRouter.put('/me/episodes/:id/progress', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(z.object({ completed: z.boolean(), positionMs: z.number().int().min(0).optional() }), req.body);
  await setEpisodeProgress(requireUser(req), id, body.completed, body.positionMs);
  res.status(204).end();
});
