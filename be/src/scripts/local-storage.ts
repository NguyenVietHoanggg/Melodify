/**
 * LOCAL TESTING ONLY — a tiny emulator of the Supabase Storage REST API (the subset this app uses),
 * so uploads, covers and uploaded-track streaming can be tested offline together with PGlite.
 * Files are kept in be/.cache/storage/<bucket>/<path>. Started automatically by `npm run db:local`.
 *
 * Implemented endpoints (all under /storage/v1):
 *   POST   /object/upload/sign/:bucket/:path        → { url: "/object/upload/sign/...?token=" }
 *   PUT    /object/upload/sign/:bucket/:path?token  ← raw file body (what the browser sends)
 *   POST   /object/sign/:bucket/:path {expiresIn}   → { signedURL: "/object/sign/...?token=" }
 *   GET    /object/sign/:bucket/:path?token         → file (supports Range, needed for <audio> seeking)
 *   GET    /object/public/:bucket/:path             → file (public buckets only)
 *   GET    /object/:bucket/:path                    → file (service key = backend download)
 *   POST|PUT /object/:bucket/:path                  ← raw body (backend upload)
 *   DELETE /object/:bucket {prefixes}               → removed objects
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const PUBLIC_BUCKETS = new Set(['images']); // mirrors supabase/migrations/…_security_and_storage.sql
const MIME: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', aac: 'audio/aac', m4a: 'audio/mp4',
  jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};

export function startLocalStorage({ port, dir }: { port: number; dir: string }) {
  const tokens = new Map<string, { key: string; mode: 'upload' | 'read'; exp: number }>();
  const issue = (key: string, mode: 'upload' | 'read', ttlSec: number) => {
    const token = crypto.randomBytes(18).toString('base64url');
    tokens.set(token, { key, mode, exp: Date.now() + ttlSec * 1000 });
    return token;
  };
  const validToken = (token: string | null, key: string, mode: 'upload' | 'read') => {
    const t = token ? tokens.get(token) : undefined;
    return !!t && t.key === key && t.mode === mode && t.exp > Date.now();
  };
  const fileOf = (key: string) => path.join(dir, ...key.split('/'));

  const readBody = (req: http.IncomingMessage) =>
    new Promise<Buffer>((resolve, reject) => {
      const parts: Buffer[] = [];
      req.on('data', (c: Buffer) => parts.push(c));
      req.on('end', () => resolve(Buffer.concat(parts)));
      req.on('error', reject);
    });

  const json = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const serve = (req: http.IncomingMessage, res: http.ServerResponse, key: string) => {
    const file = fileOf(key);
    if (!fs.existsSync(file)) return json(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    const size = fs.statSync(file).size;
    const type = MIME[key.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream';
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}` });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  };

  const store = async (req: http.IncomingMessage, res: http.ServerResponse, key: string) => {
    const body = await readBody(req);
    if (!body.length) return json(res, 400, { error: 'empty_body' });
    fs.mkdirSync(path.dirname(fileOf(key)), { recursive: true });
    fs.writeFileSync(fileOf(key), body);
    json(res, 200, { Key: key, Id: crypto.randomUUID() });
  };

  const server = http.createServer(async (req, res) => {
    // Browsers upload/stream directly from the page, so allow any origin (local testing only).
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('access-control-allow-methods', 'GET,HEAD,POST,PUT,DELETE,OPTIONS');
    res.setHeader('access-control-expose-headers', 'content-range,content-length,accept-ranges');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();

    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const route = decodeURIComponent(url.pathname).replace(/^\/storage\/v1/, '');
    if (route.split('/').includes('..')) return json(res, 400, { error: 'invalid_path' });
    const authed = /^Bearer .{10,}/.test(req.headers.authorization ?? '') || !!req.headers.apikey;
    let m: RegExpExecArray | null;
    try {
      if ((m = /^\/object\/upload\/sign\/(.+)$/.exec(route))) {
        const key = m[1]!;
        if (req.method === 'POST') {
          if (!authed) return json(res, 401, { error: 'unauthorized' });
          return json(res, 200, { url: `/object/upload/sign/${key}?token=${issue(key, 'upload', 2 * 3600)}` });
        }
        if (req.method === 'PUT') {
          if (!validToken(url.searchParams.get('token'), key, 'upload')) return json(res, 400, { error: 'invalid_signature' });
          return await store(req, res, key);
        }
      }
      if ((m = /^\/object\/sign\/(.+)$/.exec(route))) {
        const key = m[1]!;
        if (req.method === 'POST') {
          if (!authed) return json(res, 401, { error: 'unauthorized' });
          const { expiresIn = 3600 } = JSON.parse((await readBody(req)).toString() || '{}') as { expiresIn?: number };
          return json(res, 200, { signedURL: `/object/sign/${key}?token=${issue(key, 'read', expiresIn)}` });
        }
        if (req.method === 'GET' || req.method === 'HEAD') {
          if (!validToken(url.searchParams.get('token'), key, 'read')) return json(res, 400, { error: 'invalid_signature' });
          return serve(req, res, key);
        }
      }
      if ((m = /^\/object\/public\/([^/]+)\/(.+)$/.exec(route)) && (req.method === 'GET' || req.method === 'HEAD')) {
        if (!PUBLIC_BUCKETS.has(m[1]!)) return json(res, 400, { error: 'bucket_not_public' });
        return serve(req, res, `${m[1]}/${m[2]}`);
      }
      if ((m = /^\/object\/([^/]+)$/.exec(route)) && req.method === 'DELETE') {
        if (!authed) return json(res, 401, { error: 'unauthorized' });
        const { prefixes = [] } = JSON.parse((await readBody(req)).toString() || '{}') as { prefixes?: string[] };
        const removed = prefixes.filter((p) => !p.split('/').includes('..') && fs.existsSync(fileOf(`${m![1]}/${p}`)));
        for (const p of removed) fs.rmSync(fileOf(`${m![1]}/${p}`));
        return json(res, 200, removed.map((name) => ({ name, bucket_id: m![1] })));
      }
      if ((m = /^\/object\/(.+)$/.exec(route))) {
        if (!authed) return json(res, 401, { error: 'unauthorized' });
        if (req.method === 'GET' || req.method === 'HEAD') return serve(req, res, m[1]!);
        if (req.method === 'POST' || req.method === 'PUT') return await store(req, res, m[1]!);
      }
      json(res, 404, { error: 'not_found', message: `Local storage emulator: ${req.method} ${route} is not implemented` });
    } catch (err) {
      json(res, 500, { error: 'internal', message: String(err) });
    }
  });
  server.listen(port, '127.0.0.1');
  return server;
}
