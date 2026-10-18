import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env, isDev } from './config/env';
import { queryStats } from './db/stats';
import { errorHandler } from './lib/http';
import { logger } from './lib/logger';
import { aiRouter } from './modules/ai/routes';
import { authRouter } from './modules/auth/routes';
import { billingRouter } from './modules/billing/routes';
import { sessionMiddleware } from './modules/auth/session';
import { browseRouter } from './modules/browse/routes';
import { catalogRouter } from './modules/catalog/routes';
import { libraryRouter } from './modules/library/routes';
import { playerRouter } from './modules/player/routes';
import { playlistsRouter } from './modules/playlists/routes';
import { podcastsRouter } from './modules/podcasts/routes';
import { searchRouter } from './modules/search/routes';
import { socialRouter } from './modules/social/routes';
import { uploadsRouter } from './modules/uploads/routes';
import { usersRouter } from './modules/users/routes';

/** "GET /api/search?q=lofi → 200 (85ms, 4 queries)" — the query count is shown in development only. */
function requestLine(req: express.Request, status: number, detail: string) {
  const queries = isDev && req.dbStats ? `, ${req.dbStats.queries} queries` : '';
  return `${req.method} ${req.originalUrl ?? req.url} → ${status} (${detail}${queries})`;
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // we sit behind the Vite dev proxy / a reverse proxy in production
  app.disable('x-powered-by');

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use((req, _res, next) => {
    req.dbStats = { queries: 0 };
    queryStats.run(req.dbStats, next);
  });
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      customSuccessMessage: (req, res, time) => requestLine(req as express.Request, res.statusCode, `${Math.round(time)}ms`),
      customErrorMessage: (req, res, err) => requestLine(req as express.Request, res.statusCode, err.message),
      serializers: { req: () => undefined, res: () => undefined },
    }),
  );

  const api = Router();
  api.get('/health', (_req, res) => {
    res.json({ ok: true, app: env.APP_NAME, time: new Date().toISOString() });
  });
  api.use(sessionMiddleware);
  api.use('/auth', authRouter);
  api.use(usersRouter);
  api.use(catalogRouter);
  api.use(playlistsRouter);
  api.use(libraryRouter);
  api.use(searchRouter);
  api.use(browseRouter);
  api.use(playerRouter);
  api.use(billingRouter);
  api.use(uploadsRouter);
  api.use(socialRouter);
  api.use(podcastsRouter);
  api.use(aiRouter);

  app.use('/api', api);
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found' } });
  });
  app.use(errorHandler);
  return app;
}
