/**
 * A user's "taste profile": the tracks that represent them, each with a weight.
 *  - plays count with exponential time decay (half-life ≈ 3 weeks): last week matters more than last spring
 *  - Liked Songs count 1.5× (an explicit signal beats an implicit one)
 *  - private-session plays, "Exclude from your taste profile" items and hidden songs are ignored
 */
import { sql } from '../../db/client';

export interface TasteTrack {
  trackId: string;
  artistId: string | null;
  weight: number;
  vector: number[];
  genre: string | null;
  releaseYear: number | null;
  valence: number | null;
  energy: number | null;
}

export async function tasteTracks(userId: string, limit = 300): Promise<TasteTrack[]> {
  const rows = await sql<{
    trackId: string; artistId: string | null; weight: number; vec: string; genre: string | null;
    releaseDate: string | null; valence: number | null; energy: number | null;
  }[]>`
    with plays as (
      select pe.track_id, sum(exp(-extract(epoch from now() - pe.started_at) / (86400 * 30))) as w
        from play_events pe
       where pe.user_id = ${userId} and pe.counted and not pe.is_private and pe.track_id is not null
         and pe.started_at > now() - interval '180 days'
         and not exists (
           select 1 from library_items li
            where li.user_id = pe.user_id and li.exclude_from_taste
              and li.item_type = pe.context_type and li.item_id::text = pe.context_id)
       group by pe.track_id
    ),
    liked as (
      select track_id, 1.5 * exp(-extract(epoch from now() - added_at) / (86400 * 180)) as w
        from saved_tracks where user_id = ${userId}
    ),
    combined as (
      select track_id, sum(w) as w from (select * from plays union all select * from liked) x group by track_id
    )
    select c.track_id, c.w::real as weight, t.embedding::text as vec, t.genre, t.release_date, t.valence, t.energy,
           ta.artist_id
      from combined c
      join tracks t on t.id = c.track_id
      left join track_artists ta on ta.track_id = t.id and ta.position = 0
     where t.embedding is not null and t.origin = 'catalog'
       and not exists (select 1 from track_feedback f where f.user_id = ${userId} and f.track_id = c.track_id and f.kind in ('exclude_taste', 'hide'))
     order by c.w desc
     limit ${limit}`;
  return rows.map((r) => ({
    trackId: r.trackId,
    artistId: r.artistId,
    weight: r.weight,
    vector: JSON.parse(r.vec) as number[],
    genre: r.genre,
    releaseYear: r.releaseDate ? Number(r.releaseDate.slice(0, 4)) : null,
    valence: r.valence,
    energy: r.energy,
  }));
}

/** Top artists by summed taste weight. */
export function topArtistIds(taste: TasteTrack[], n: number): string[] {
  const score = new Map<string, number>();
  for (const t of taste) if (t.artistId) score.set(t.artistId, (score.get(t.artistId) ?? 0) + t.weight);
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
}

export function topGenres(taste: TasteTrack[], n: number): string[] {
  const score = new Map<string, number>();
  for (const t of taste) if (t.genre) score.set(t.genre, (score.get(t.genre) ?? 0) + t.weight);
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([g]) => g);
}
