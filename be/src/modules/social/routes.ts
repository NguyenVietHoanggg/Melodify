import { Router } from 'express';
import { z } from 'zod';
import { pagingSchema, parse, requireUser } from '../../lib/http';
import { longText } from '../../lib/validation';
import { reportTrack } from '../uploads/service';
import {
  contentFeed, followingUsers, friendActivity, getProfile, getProfileList, markFeedSeen, recents, setFollowUser, unseenFeedCount,
} from './service';

export const socialRouter = Router();
const idParams = z.object({ id: z.guid() });

socialRouter.get('/users/:id', async (req, res) => {
  res.json(await getProfile(parse(idParams, req.params).id, req.userId));
});

socialRouter.get('/users/:id/lists/:list', async (req, res) => {
  const { id, list } = parse(
    idParams.extend({ list: z.enum(['playlists', 'followers', 'following', 'top-artists', 'top-tracks', 'uploads']) }),
    req.params,
  );
  const q = parse(pagingSchema, req.query);
  res.json(await getProfileList(id, req.userId, list, q.limit, q.offset));
});

socialRouter.put('/users/:id/follow', async (req, res) => {
  await setFollowUser(requireUser(req), parse(idParams, req.params).id, true);
  res.status(204).end();
});

socialRouter.delete('/users/:id/follow', async (req, res) => {
  await setFollowUser(requireUser(req), parse(idParams, req.params).id, false);
  res.status(204).end();
});

socialRouter.get('/me/following/contains', async (req, res) => {
  const { ids } = parse(z.object({ ids: z.string().transform((s) => s.split(',').filter(Boolean)).pipe(z.array(z.guid()).max(50)) }), req.query);
  res.json(await followingUsers(requireUser(req), ids));
});

socialRouter.get('/me/friend-activity', async (req, res) => {
  res.json({ items: await friendActivity(requireUser(req)) });
});

socialRouter.get('/content-feed', async (req, res) => {
  const { filter } = parse(z.object({ filter: z.enum(['music', 'podcasts', 'community']).optional() }), req.query);
  res.json({ items: await contentFeed(requireUser(req), filter) });
});

socialRouter.get('/content-feed/unseen', async (req, res) => {
  res.json({ count: await unseenFeedCount(requireUser(req)) });
});

socialRouter.post('/content-feed/seen', async (req, res) => {
  await markFeedSeen(requireUser(req));
  res.status(204).end();
});

socialRouter.get('/me/recents', async (req, res) => {
  const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }), req.query);
  res.json({ items: await recents(requireUser(req), limit) });
});

/** Report a user-uploaded track (copyright, offensive…). */
socialRouter.post('/tracks/:id/report', async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(
    z
      .object({ reason: z.enum(['copyright', 'offensive', 'spam', 'other']), details: longText(1000).optional() })
      // "Other" means nothing without an explanation.
      .refine((b) => b.reason !== 'other' || (b.details?.length ?? 0) >= 5, { message: 'details_required', path: ['details'] }),
    req.body,
  );
  await reportTrack(requireUser(req), id, body.reason, body.details);
  res.status(204).end();
});
