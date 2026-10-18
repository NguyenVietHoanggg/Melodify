/**
 * WebSocket hub (/api/ws): keeps track of which devices of each user are online and pushes them the new
 * player state whenever it changes — the backbone of "Connect" (control web playback from a phone).
 *
 * Auth: the socket handshake carries the same httpOnly session cookies as REST calls (native apps can
 * pass ?access_token=). One user can have many devices; each gets its own view (only the active device
 * receives stream URLs).
 */
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { createServerClient } from '@supabase/ssr';
import { parse as parseCookie } from 'cookie';
import { WebSocketServer, type WebSocket } from 'ws';
import type { DeviceInfo } from '../../contracts';
import { env, localDevUserId } from '../../config/env';
import { sql } from '../../db/client';
import { logger } from '../../lib/logger';
import type { Platform } from '../billing/plans';
import * as player from '../player/service';

interface Connection {
  ws: WebSocket;
  userId: string;
  deviceId: string;
  name: string;
  type: DeviceInfo['type'];
  platform: Platform;
  volume: number;
  alive: boolean;
}

const byUser = new Map<string, Map<string, Connection>>();
const DEVICE_TYPES = new Set(['computer', 'smartphone', 'tablet', 'speaker', 'tv', 'web']);

function devicesOf(userId: string): DeviceInfo[] {
  return [...(byUser.get(userId)?.values() ?? [])].map((c) => ({
    id: c.deviceId, name: c.name, type: c.type, isActive: false, isOnline: true, volume: c.volume,
  }));
}
player.setDeviceProvider(devicesOf);

export function sendToDevice(userId: string, deviceId: string, message: unknown) {
  const conn = byUser.get(userId)?.get(deviceId);
  if (conn && conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(message));
}

// Coalesce bursts of changes (e.g. next + autoplay) into one push per user.
const pending = new Map<string, NodeJS.Timeout>();
function scheduleBroadcast(userId: string) {
  if (pending.has(userId)) return;
  pending.set(userId, setTimeout(() => {
    pending.delete(userId);
    void broadcast(userId);
  }, 40));
}

async function broadcast(userId: string) {
  const conns = [...(byUser.get(userId)?.values() ?? [])];
  await Promise.all(conns.map(async (c) => {
    try {
      const view = await player.getView({ userId, deviceId: c.deviceId, platform: c.platform });
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify({ type: 'player', view }));
    } catch (err) {
      logger.warn({ err }, 'broadcast failed');
    }
  }));
}
player.playerEvents.on('changed', scheduleBroadcast);

async function authenticate(req: IncomingMessage, url: URL): Promise<string | null> {
  if (localDevUserId) return localDevUserId;
  const cookies = parseCookie(req.headers.cookie ?? '');
  const client = createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => Object.entries(cookies).map(([name, value]) => ({ name, value: value ?? '' })),
      setAll: () => {}, // can't set cookies on an upgrade response; REST calls keep the session fresh
    },
  });
  let token = url.searchParams.get('access_token') ?? undefined;
  if (!token) token = (await client.auth.getSession()).data.session?.access_token;
  if (!token) return null;
  const { data, error } = await client.auth.getClaims(token);
  return error ? null : (data?.claims.sub ?? null);
}

function reject(socket: Duplex, status: string) {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

export function attachRealtime(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/api/ws') return reject(socket, '404 Not Found');
    const origin = req.headers.origin;
    if (origin && origin !== env.WEB_ORIGIN) return reject(socket, '403 Forbidden'); // cross-site WebSocket hijacking guard
    const userId = await authenticate(req, url).catch(() => null);
    if (!userId) return reject(socket, '401 Unauthorized');
    const deviceId = (url.searchParams.get('deviceId') ?? '').slice(0, 64);
    if (deviceId.length < 4) return reject(socket, '400 Bad Request');
    const typeParam = url.searchParams.get('type') ?? 'web';
    wss.handleUpgrade(req, socket, head, (ws) => {
      const conn: Connection = {
        ws, userId, deviceId,
        name: (url.searchParams.get('name') ?? 'Web Player').slice(0, 60),
        type: (DEVICE_TYPES.has(typeParam) ? typeParam : 'web') as DeviceInfo['type'],
        platform: url.searchParams.get('platform') === 'mobile' ? 'mobile' : 'web',
        volume: 1,
        alive: true,
      };
      onConnect(conn);
    });
  });

  // Ping every 30s; drop sockets that stopped answering (laptop asleep, network gone…).
  const pinger = setInterval(() => {
    for (const conns of byUser.values()) {
      for (const c of conns.values()) {
        if (!c.alive) {
          c.ws.terminate();
          continue;
        }
        c.alive = false;
        c.ws.ping();
      }
    }
  }, 30_000);
  wss.on('close', () => clearInterval(pinger));
  return wss;
}

const goneTimers = new Map<string, NodeJS.Timeout>();

function onConnect(c: Connection) {
  const conns = byUser.get(c.userId) ?? new Map<string, Connection>();
  conns.get(c.deviceId)?.ws.close(4000, 'replaced'); // same device reconnected (page reload)
  conns.set(c.deviceId, c);
  byUser.set(c.userId, conns);
  clearTimeout(goneTimers.get(`${c.userId}:${c.deviceId}`));

  void sql`
    insert into devices (user_id, id, name, type) values (${c.userId}, ${c.deviceId}, ${c.name}, ${c.type})
    on conflict (user_id, id) do update set name = excluded.name, type = excluded.type, last_seen_at = now()`.catch(() => {});

  c.ws.on('pong', () => {
    c.alive = true;
  });
  c.ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as { type: string; volume?: number };
      if (msg.type === 'volume' && typeof msg.volume === 'number') {
        c.volume = Math.min(1, Math.max(0, msg.volume));
        scheduleBroadcast(c.userId);
      } else if (msg.type === 'ping') {
        c.ws.send(JSON.stringify({ type: 'pong', serverTime: Date.now() }));
      }
    } catch {
      // ignore malformed frames
    }
  });
  c.ws.on('close', () => {
    const current = byUser.get(c.userId);
    if (current?.get(c.deviceId) !== c) return;
    current.delete(c.deviceId);
    if (!current.size) byUser.delete(c.userId);
    scheduleBroadcast(c.userId);
    // Give a reloading tab 10 s to come back before we consider the device gone.
    goneTimers.set(`${c.userId}:${c.deviceId}`, setTimeout(() => {
      if (!byUser.get(c.userId)?.has(c.deviceId)) void player.deviceGone(c.userId, c.deviceId);
    }, 10_000));
  });

  scheduleBroadcast(c.userId);
}
