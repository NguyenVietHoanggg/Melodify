import { Router, type Request } from 'express';
import { z } from 'zod';
import { parse, requireUser } from '../../lib/http';
import { platformOf } from '../users/service';
import { sendToDevice } from '../realtime/hub';
import * as player from './service';

export const playerRouter = Router();

const caller = (req: Request): player.Caller => ({ userId: requireUser(req), deviceId: req.deviceId, platform: platformOf(req) });
const position = z.number().min(0).max(24 * 3600_000).optional();

playerRouter.get('/me/player', async (req, res) => {
  res.json(await player.getView(caller(req)));
});

playerRouter.put('/me/player/play', async (req, res) => {
  const body = parse(
    z.object({
      context: z
        .object({
          type: z.enum(['playlist', 'album', 'artist', 'collection', 'show', 'episode', 'track', 'uploads']),
          id: z.string().max(40).nullable(),
        })
        .optional(),
      offset: z.object({ index: z.number().int().min(0).optional(), trackId: z.guid().optional() }).optional(),
      positionMs: position,
    }),
    req.body ?? {},
  );
  res.json(await player.play(caller(req), body));
});

playerRouter.put('/me/player/pause', async (req, res) => {
  const { positionMs } = parse(z.object({ positionMs: position }), req.body ?? {});
  res.json(await player.pause(caller(req), positionMs));
});

playerRouter.post('/me/player/next', async (req, res) => {
  const body = parse(
    z.object({ reason: z.enum(['skipped', 'completed']).default('skipped'), positionMs: position, expectedUid: z.string().max(20).optional() }),
    req.body ?? {},
  );
  res.json(await player.next(caller(req), body));
});

playerRouter.post('/me/player/previous', async (req, res) => {
  const { positionMs } = parse(z.object({ positionMs: position }), req.body ?? {});
  res.json(await player.previous(caller(req), { positionMs }));
});

playerRouter.put('/me/player/seek', async (req, res) => {
  const { positionMs } = parse(z.object({ positionMs: z.number().min(0) }), req.body);
  res.json(await player.seek(caller(req), positionMs));
});

playerRouter.put('/me/player/heartbeat', async (req, res) => {
  const { positionMs } = parse(z.object({ positionMs: z.number().min(0) }), req.body);
  await player.heartbeat(caller(req), positionMs);
  res.status(204).end();
});

playerRouter.put('/me/player/shuffle', async (req, res) => {
  const { mode } = parse(z.object({ mode: z.enum(['off', 'shuffle', 'smart']) }), req.body);
  res.json(await player.setShuffle(caller(req), mode));
});

playerRouter.put('/me/player/repeat', async (req, res) => {
  const { mode } = parse(z.object({ mode: z.enum(['off', 'context', 'track']) }), req.body);
  res.json(await player.setRepeat(caller(req), mode));
});

playerRouter.post('/me/player/queue', async (req, res) => {
  const { items } = parse(
    z.object({ items: z.array(z.object({ kind: z.enum(['track', 'episode']).default('track'), id: z.guid() })).min(1).max(100) }),
    req.body,
  );
  res.json(await player.addToQueue(caller(req), items));
});

playerRouter.delete('/me/player/queue', async (req, res) => {
  const { uids } = parse(z.object({ uids: z.array(z.string().max(20)).max(500).optional() }), req.body ?? {});
  res.json(uids?.length ? await player.removeFromQueue(caller(req), uids) : await player.clearQueue(caller(req)));
});

playerRouter.put('/me/player/queue/:uid/position', async (req, res) => {
  const { uid } = parse(z.object({ uid: z.string().max(20) }), req.params);
  const { toIndex } = parse(z.object({ toIndex: z.number().int().min(0) }), req.body);
  res.json(await player.moveInQueue(caller(req), uid, toIndex));
});

playerRouter.post('/me/player/queue/:uid/play', async (req, res) => {
  const { uid } = parse(z.object({ uid: z.string().max(20) }), req.params);
  res.json(await player.playQueueItem(caller(req), uid));
});

/** Spotify Connect: transfer playback to another device. */
playerRouter.put('/me/player/device', async (req, res) => {
  const body = parse(z.object({ deviceId: z.string().min(4).max(64), play: z.boolean().optional() }), req.body);
  res.json(await player.transfer(caller(req), body.deviceId, body.play));
});

/** Remote volume change for one of my devices (the device applies it and reports back). */
playerRouter.put('/me/player/volume', async (req, res) => {
  const userId = requireUser(req);
  const body = parse(z.object({ deviceId: z.string().min(4).max(64), volume: z.number().min(0).max(1) }), req.body);
  sendToDevice(userId, body.deviceId, { type: 'command', command: 'volume', volume: body.volume });
  res.status(204).end();
});
