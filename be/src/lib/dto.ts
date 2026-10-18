import { env } from '../config/env';

/** Dates from Postgres arrive as JS Date objects; the API always speaks ISO-8601 strings. */
export const toIso = (d: Date | string | null | undefined): string | null =>
  d == null ? null : d instanceof Date ? d.toISOString() : d;

/** Internal URIs, same idea as Spotify's `spotify:playlist:<id>`. */
export const uri = (type: string, id: string | null) => `melodify:${type}${id ? `:${id}` : ''}`;

export const BUILTIN = {
  liked: '00000000-0000-0000-0000-000000000001',
  episodes: '00000000-0000-0000-0000-000000000002',
  uploads: '00000000-0000-0000-0000-000000000003',
} as const;

/** Editorial playlists are "owned" by the app itself. */
export const appName = () => env.APP_NAME;

export function paging<T>(items: T[], total: number, limit: number, offset: number) {
  return { items, total, limit, offset, nextOffset: offset + items.length < total ? offset + items.length : null };
}
