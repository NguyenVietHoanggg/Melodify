/**
 * Collaborative-filtering signal: "tracks that people put together, belong together".
 *
 * Sources:
 *  - human playlists (imported + users' own): two tracks close to each other in a playlist get a weight
 *    that decays with distance (neighbours count more than tracks 10 positions apart);
 *  - listening sessions: track B played right after A by the same user within 30 minutes.
 * Algorithm-generated playlists (editorial/mix/radio) are excluded to avoid feedback loops
 * (recommending what we recommended because we recommended it).
 */
import { sql } from '../../db/client';

export async function rebuildCooccurrence(): Promise<number> {
  return sql.begin(async (tx) => {
    await tx`delete from track_cooccurrence`;
    const result = await tx`
      insert into track_cooccurrence (track_a, track_b, weight)
      with items as (
        select pt.playlist_id, pt.track_id,
               row_number() over (partition by pt.playlist_id order by pt.position) as rn
          from playlist_tracks pt
          join playlists p on p.id = pt.playlist_id
         where p.kind in ('user', 'imported')
      ),
      playlist_pairs as (
        select a.track_id as track_a, b.track_id as track_b, 1.0 / (1 + abs(a.rn - b.rn) / 3.0) as w
          from items a
          join items b on a.playlist_id = b.playlist_id and a.track_id <> b.track_id and abs(a.rn - b.rn) <= 10
      ),
      plays as (
        select user_id, track_id, started_at,
               lead(track_id) over w as next_track,
               lead(started_at) over w - started_at as gap
          from play_events
         where track_id is not null and not is_private
        window w as (partition by user_id order by started_at)
      ),
      session_pairs as (
        select track_id as track_a, next_track as track_b, 0.5 as w
          from plays where next_track is not null and next_track <> track_id and gap < interval '30 minutes'
        union all
        select next_track, track_id, 0.5
          from plays where next_track is not null and next_track <> track_id and gap < interval '30 minutes'
      )
      select track_a, track_b, sum(w)::real
        from (select * from playlist_pairs union all select * from session_pairs) x
       group by track_a, track_b`;
    return result.count;
  });
}
