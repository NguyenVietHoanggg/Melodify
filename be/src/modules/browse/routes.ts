import { Router, type Request } from 'express';
import { z } from 'zod';
import { sql } from '../../db/client';
import { notFound, parse, requireUser } from '../../lib/http';
import { ensureRadio } from '../reco/radio';
import { getCategories, getCategoryPage, getHome, getSectionPage, type HomeFilter } from './service';

export const browseRouter = Router();

/** Content language (category names, mix descriptions): ?locale= → X-Locale header → Vietnamese. */
export const localeOf = (req: Request): 'vi' | 'en' => {
  const v = (req.query.locale ?? req.header('x-locale') ?? 'vi').toString();
  return v.startsWith('en') ? 'en' : 'vi';
};

browseRouter.get('/browse/home', async (req, res) => {
  const { filter } = parse(z.object({ filter: z.enum(['all', 'music', 'podcasts', 'community']).default('all') }), req.query);
  let displayName: string | undefined;
  if (req.userId) {
    const [p] = await sql<{ displayName: string }[]>`select display_name from profiles where id = ${req.userId}`;
    displayName = p?.displayName;
  }
  res.json({ sections: await getHome(req.userId, filter as HomeFilter, localeOf(req), displayName) });
});

browseRouter.get('/browse/sections/:id', async (req, res) => {
  const { id } = parse(z.object({ id: z.string().max(40) }), req.params);
  const page = await getSectionPage(id, req.userId, localeOf(req));
  if (!page) throw notFound();
  res.json(page);
});

browseRouter.get('/browse/categories', async (req, res) => {
  res.json({ items: await getCategories(localeOf(req)) });
});

browseRouter.get('/browse/categories/:id', async (req, res) => {
  const { id } = parse(z.object({ id: z.string().max(40) }), req.params);
  const page = await getCategoryPage(id, req.userId, localeOf(req));
  if (!page) throw notFound();
  res.json(page);
});

/** "Go to song/artist radio": returns the radio playlist to open (created on demand). */
browseRouter.post('/radio', async (req, res) => {
  requireUser(req);
  const body = parse(z.object({ type: z.enum(['track', 'artist', 'album', 'playlist']), id: z.guid() }), req.body);
  res.json({ playlistId: await ensureRadio(body.type, body.id) });
});
