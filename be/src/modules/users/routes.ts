import { Router } from 'express';
import { z } from 'zod';
import { sql } from '../../db/client';
import { badRequest, parse, requireUser } from '../../lib/http';
import { birthDate, text } from '../../lib/validation';
import { ageOn, GENDERS, MIN_AGE } from '../auth/policy';
import { createImageUpload, finalizeImage, removeOwnedImage } from '../media/service';
import { invalidateUser } from '../player/service';
import { getMe } from './service';

export const usersRouter = Router();

usersRouter.get('/me', async (req, res) => {
  res.json(await getMe(requireUser(req), req));
});

usersRouter.patch('/me', async (req, res) => {
  const userId = requireUser(req);
  const body = parse(
    z.object({
      displayName: text(1, 60).optional(),
      locale: z.enum(['vi', 'en']).optional(),
      // (The photo is set only through /me/avatar, which checks the file is the user's own upload.)
    }),
    req.body,
  );
  await sql`
    update profiles set
      display_name = coalesce(${body.displayName ?? null}, display_name),
      locale       = coalesce(${body.locale ?? null}, locale)
    where id = ${userId}`;
  res.json(await getMe(userId, req));
});

const settingsPatch = z
  .object({
    audioQuality: z.enum(['automatic', 'low', 'normal', 'high', 'very_high', 'lossless']),
    normalizeVolume: z.boolean(),
    crossfadeSec: z.number().int().min(0).max(12),
    automix: z.boolean(),
    autoplay: z.boolean(),
    allowExplicit: z.boolean(),
    showNowPlayingOnPlay: z.boolean(),
    compactLibrary: z.boolean(),
    privateSession: z.boolean(),
    shareListeningActivity: z.boolean(),
    showFollowsOnProfile: z.boolean(),
    showPlaylistsOnProfile: z.boolean(),
    showRecentArtistsOnProfile: z.boolean(),
    publishNewPlaylists: z.boolean(),
  })
  .partial()
  .strict();

/**
 * "Tell us about yourself" — finishes an account created with Google / Facebook / Apple, which don't share a
 * birthday or gender. Same age rule as the sign-up form; it can only fill these in once.
 */
usersRouter.put('/me/details', async (req, res) => {
  const userId = requireUser(req);
  const body = parse(z.object({ displayName: text(1, 60), birthDate, gender: z.enum(GENDERS) }), req.body);
  if (ageOn(body.birthDate) < MIN_AGE) throw badRequest('too_young', undefined, { minAge: MIN_AGE });
  const [row] = await sql<{ id: string }[]>`
    update profiles set display_name = ${body.displayName}, birth_date = ${body.birthDate}, gender = ${body.gender}
     where id = ${userId} and birth_date is null
    returning id`;
  if (!row) throw badRequest('details_already_set');
  res.json(await getMe(userId, req));
});

usersRouter.patch('/me/settings', async (req, res) => {
  const userId = requireUser(req);
  const patch = parse(settingsPatch, req.body);
  // jsonb "||" merges the patch into the stored settings object.
  await sql`update profiles set settings = settings || ${sql.json(patch)} where id = ${userId}`;
  invalidateUser(userId); // crossfade/autoplay/quality changes apply immediately
  res.json(await getMe(userId, req));
});

/** Profile photo: 1) get a signed upload URL, 2) the browser uploads, 3) confirm the path. */
usersRouter.post('/me/avatar-upload', async (req, res) => {
  const userId = requireUser(req);
  const { contentType } = parse(z.object({ contentType: z.string().max(40) }), req.body);
  res.json(await createImageUpload('avatars', userId, contentType));
});

usersRouter.put('/me/avatar', async (req, res) => {
  const userId = requireUser(req);
  const { path } = parse(z.object({ path: z.string().max(300) }), req.body);
  const { url } = await finalizeImage('avatars', userId, path);
  // (Joining the row to itself lets RETURNING show the value from before the update.)
  const [old] = await sql<{ avatarUrl: string | null }[]>`
    update profiles p set avatar_url = ${url} from profiles prev where p.id = ${userId} and prev.id = p.id returning prev.avatar_url`;
  if (old?.avatarUrl !== url) await removeOwnedImage('avatars', userId, old?.avatarUrl);
  res.json(await getMe(userId, req));
});

usersRouter.delete('/me/avatar', async (req, res) => {
  const userId = requireUser(req);
  const [old] = await sql<{ avatarUrl: string | null }[]>`
    update profiles p set avatar_url = null from profiles prev where p.id = ${userId} and prev.id = p.id returning prev.avatar_url`;
  await removeOwnedImage('avatars', userId, old?.avatarUrl);
  res.json(await getMe(userId, req));
});
