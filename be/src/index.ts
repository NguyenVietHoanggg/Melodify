import http from 'node:http';
import { env } from './config/env';
import { sql } from './db/client';
import { logger } from './lib/logger';
import { createApp } from './app';
import { startBillingJob } from './modules/billing/service';
import { flushSessions } from './modules/player/service';
import { attachRealtime } from './modules/realtime/hub';
import { refreshShows } from './modules/podcasts/store';
import { cleanupAbandonedUploads } from './modules/uploads/service';

const server = http.createServer(createApp());
attachRealtime(server);
startBillingJob();
setInterval(() => void cleanupAbandonedUploads().catch(() => {}), 60 * 60_000);
// New podcast episodes (for What's New): re-read feeds older than 6 h, a few at a time.
setInterval(() => void refreshShows().catch(() => {}), 15 * 60_000);

server.listen(env.PORT, () => {
  logger.info(`🎧 ${env.APP_NAME} API ready on http://localhost:${env.PORT}/api`);
});

// Graceful shutdown: stop accepting connections, let in-flight requests finish, close the DB pool.
async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down…`);
  server.close();
  await flushSessions().catch(() => {});
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
