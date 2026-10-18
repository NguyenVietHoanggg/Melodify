/**
 * Editorial playlists ("Top 50", "Chill Vibes", "Beast Mode"…) generated from the catalog by rules on
 * genre / mood / tempo / energy, with at most 2 songs per artist. Re-running regenerates them in place.
 * Their covers are drawn by the UI from `generator.cover` (no image files needed).
 */
import { sql } from '../../db/client';

interface EditorialDef {
  key: string;
  name: string;
  description: string;
  categoryId: string;
  label: string;
  color: string;
  genres?: string[];
  moods?: string[];
  minEnergy?: number;
  maxEnergy?: number;
  minValence?: number;
  maxValence?: number;
  minBpm?: number;
  minInstrumental?: number;
  minDance?: number;
  order: 'popular' | 'newest' | 'fresh' | 'viral';
  size: number;
  artistImage?: boolean;
}

export const EDITORIAL: EditorialDef[] = [
  { key: 'top-50', name: 'Top 50 Melodify', description: 'Những bài hát được nghe nhiều nhất trên Melodify. Cập nhật hằng ngày.', categoryId: 'charts', label: 'Top 50', color: '#e13300', order: 'popular', size: 50 },
  { key: 'viral-50', name: 'Viral 50', description: 'Những bản nhạc đang lan truyền nhanh nhất lúc này.', categoryId: 'charts', label: 'Viral 50', color: '#1e3264', order: 'viral', size: 50 },
  { key: 'new-music-friday', name: 'New Music Friday', description: 'Nhạc mới ra lò mỗi thứ Sáu. Ảnh bìa: nghệ sĩ nổi bật tuần này.', categoryId: 'new-releases', label: 'New Music Friday', color: '#608108', order: 'newest', size: 50, artistImage: true },
  { key: 'fresh-finds', name: 'Fresh Finds', description: 'Những tài năng mới chớm nở mà bạn nên biết sớm.', categoryId: 'discover', label: 'Fresh Finds', color: '#2d46b9', order: 'fresh', size: 40, artistImage: true },
  { key: 'pop-rising', name: 'Pop Rising', description: 'Pop đang lên — những ca khúc bắt tai nhất.', categoryId: 'pop', label: 'Pop Rising', color: '#477d95', genres: ['pop'], order: 'popular', size: 40, artistImage: true },
  { key: 'hiphop-central', name: 'Hip-Hop Central', description: 'Beat nặng, flow chất. Hip-hop hay nhất hiện tại.', categoryId: 'hiphop', label: 'Hip-Hop', color: '#e13300', genres: ['hiphop'], order: 'popular', size: 40, artistImage: true },
  { key: 'rnb-mood', name: 'R&B Mood', description: 'Giai điệu R&B mượt mà cho những phút giây thư thả.', categoryId: 'rnb', label: 'R&B', color: '#dc148c', genres: ['rnb'], order: 'popular', size: 40, artistImage: true },
  { key: 'electronic-rising', name: 'Electronic Rising', description: 'Điện tử, techno, bass — năng lượng không ngừng.', categoryId: 'electronic', label: 'Electronic', color: '#0d73ec', genres: ['electronic', 'techno', 'bass'], order: 'popular', size: 50, artistImage: true },
  { key: 'house-party', name: 'House Party', description: 'Bật lên là sàn nhảy tự kín người.', categoryId: 'dance', label: 'House Party', color: '#d84000', genres: ['house'], order: 'popular', size: 40, artistImage: true },
  { key: 'lofi-beats', name: 'Lo-fi Beats', description: 'Nhịp lo-fi êm dịu để học bài, làm việc hay thư giãn.', categoryId: 'lofi', label: 'Lo-fi Beats', color: '#537aa1', genres: ['lofi'], order: 'popular', size: 50 },
  { key: 'chill-vibes', name: 'Chill Vibes', description: 'Thả lỏng một chút với những giai điệu nhẹ nhàng.', categoryId: 'chill', label: 'Chill Vibes', color: '#27856a', moods: ['Peaceful', 'Easygoing', 'Tender', 'Cool'], maxEnergy: 0.6, order: 'popular', size: 50 },
  { key: 'beast-mode', name: 'Beast Mode', description: 'Năng lượng cực đại cho buổi tập của bạn.', categoryId: 'workout', label: 'Beast Mode', color: '#777777', moods: ['Energizing', 'Fiery', 'Aggressive', 'Empowering', 'Rowdy'], minEnergy: 0.7, minBpm: 115, order: 'popular', size: 50 },
  { key: 'deep-focus', name: 'Deep Focus', description: 'Nhạc không lời giúp bạn tập trung tối đa.', categoryId: 'focus', label: 'Deep Focus', color: '#503750', genres: ['lofi', 'ambient', 'classical', 'soundtrack'], maxEnergy: 0.5, minInstrumental: 0.5, order: 'popular', size: 50 },
  { key: 'sleep', name: 'Sleep', description: 'Âm thanh dịu êm đưa bạn vào giấc ngủ.', categoryId: 'sleep', label: 'Sleep', color: '#1e3264', genres: ['ambient', 'classical', 'lofi'], maxEnergy: 0.35, order: 'popular', size: 40 },
  { key: 'love-songs', name: 'Love Songs', description: 'Những bản tình ca ngọt ngào.', categoryId: 'romance', label: 'Love Songs', color: '#8c1932', moods: ['Romantic', 'Sensual', 'Tender'], order: 'popular', size: 40, artistImage: true },
  { key: 'mood-booster', name: 'Mood Booster', description: 'Nhạc vui tươi để ngày của bạn thêm rạng rỡ.', categoryId: 'mood', label: 'Mood Booster', color: '#e8115b', minValence: 0.75, minEnergy: 0.6, order: 'popular', size: 50 },
  { key: 'sad-hours', name: 'Sad Hours', description: 'Khi lòng nặng trĩu, để âm nhạc nói thay.', categoryId: 'mood', label: 'Sad Hours', color: '#2d46b9', moods: ['Melancholy', 'Sentimental', 'Yearning', 'Brooding'], order: 'popular', size: 40 },
  { key: 'party-starters', name: 'Party Starters', description: 'Khởi động bữa tiệc với những bài sôi động nhất.', categoryId: 'party', label: 'Party', color: '#af2896', moods: ['Upbeat', 'Excited', 'Rowdy', 'Energizing'], minDance: 0.65, order: 'popular', size: 50 },
  { key: 'night-drive', name: 'Night Drive', description: 'Đường phố về đêm, đèn vàng và những giai điệu synth.', categoryId: 'electronic', label: 'Night Drive', color: '#1e3264', genres: ['electronic', 'alternative', 'house'], minEnergy: 0.4, maxEnergy: 0.78, maxValence: 0.6, order: 'popular', size: 40 },
  { key: 'rock-this', name: 'Rock This', description: 'Guitar gầm gừ và trống dồn dập.', categoryId: 'rock', label: 'Rock This', color: '#e91429', genres: ['rock'], order: 'popular', size: 40, artistImage: true },
  { key: 'indie-radar', name: 'Indie Radar', description: 'Âm nhạc indie & alternative đáng chú ý.', categoryId: 'indie', label: 'Indie Radar', color: '#e1118c', genres: ['alternative'], order: 'popular', size: 40, artistImage: true },
  { key: 'jazz-vibes', name: 'Jazz Vibes', description: 'Jazz cho buổi tối thư thái.', categoryId: 'jazz', label: 'Jazz Vibes', color: '#a56752', genres: ['jazz'], order: 'popular', size: 40 },
  { key: 'acoustic-chill', name: 'Acoustic Chill', description: 'Guitar mộc và giọng hát mộc mạc.', categoryId: 'acoustic', label: 'Acoustic', color: '#bc5900', genres: ['acoustic'], order: 'popular', size: 40 },
  { key: 'classical-essentials', name: 'Classical Essentials', description: 'Những tác phẩm cổ điển và tân cổ điển tinh tuyển.', categoryId: 'classical', label: 'Classical', color: '#7d4b32', genres: ['classical'], order: 'popular', size: 40 },
  { key: 'world-beats', name: 'World Beats', description: 'Vòng quanh thế giới qua âm nhạc.', categoryId: 'world', label: 'World Beats', color: '#148a08', genres: ['world'], order: 'popular', size: 40 },
  { key: 'cinematic', name: 'Cinematic', description: 'Âm nhạc hùng tráng như nhạc phim.', categoryId: 'soundtrack', label: 'Cinematic', color: '#b06239', genres: ['soundtrack'], order: 'popular', size: 40 },
  { key: 'ambient-spaces', name: 'Ambient Spaces', description: 'Không gian âm thanh để thả trôi suy nghĩ.', categoryId: 'ambient', label: 'Ambient', color: '#2d46b9', genres: ['ambient'], order: 'popular', size: 40 },
];

interface Candidate {
  id: string;
  artistId: string;
  avatarUrl: string | null;
}

async function pick(def: EditorialDef): Promise<Candidate[]> {
  const orderBy =
    def.order === 'newest' ? sql`t.release_date desc nulls last, t.popularity desc`
    : def.order === 'fresh' ? sql`t.release_date desc nulls last, abs(t.popularity - 45)`
    : def.order === 'viral' ? sql`(t.popularity - extract(day from now() - coalesce(t.release_date, '2000-01-01'::date)) / 5) desc`
    : sql`t.popularity desc`;
  const rows = await sql<Candidate[]>`
    select t.id, ta.artist_id, ar.avatar_url
      from tracks t
      join track_artists ta on ta.track_id = t.id and ta.position = 0
      join artists ar on ar.id = ta.artist_id
     where t.origin = 'catalog' and t.is_playable
       ${def.genres ? sql`and t.genre = any(${def.genres})` : sql``}
       ${def.moods ? sql`and t.moods && ${def.moods}::text[]` : sql``}
       ${def.minEnergy != null ? sql`and t.energy >= ${def.minEnergy}` : sql``}
       ${def.maxEnergy != null ? sql`and t.energy <= ${def.maxEnergy}` : sql``}
       ${def.minValence != null ? sql`and t.valence >= ${def.minValence}` : sql``}
       ${def.maxValence != null ? sql`and t.valence <= ${def.maxValence}` : sql``}
       ${def.minBpm != null ? sql`and t.bpm >= ${def.minBpm}` : sql``}
       ${def.minInstrumental != null ? sql`and t.instrumentalness >= ${def.minInstrumental}` : sql``}
       ${def.minDance != null ? sql`and t.danceability >= ${def.minDance}` : sql``}
     order by ${orderBy}
     limit ${def.size * 4}`;
  const perArtist = new Map<string, number>();
  const out: Candidate[] = [];
  for (const r of rows) {
    const n = perArtist.get(r.artistId) ?? 0;
    if (n >= 2) continue;
    perArtist.set(r.artistId, n + 1);
    out.push(r);
    if (out.length === def.size) break;
  }
  return out;
}

export async function generateEditorialPlaylists(log: (...a: unknown[]) => void = console.log) {
  let made = 0;
  for (const def of EDITORIAL) {
    const tracks = await pick(def);
    if (tracks.length < 8) {
      log(`  skip ${def.key} (only ${tracks.length} matching tracks)`);
      continue;
    }
    const generator = {
      type: 'editorial',
      key: def.key,
      categoryId: def.categoryId,
      cover: {
        style: 'editorial',
        label: def.label,
        color: def.color,
        imageUrl: def.artistImage ? (tracks.find((t) => t.avatarUrl)?.avatarUrl ?? null) : null,
      },
    };
    await sql.begin(async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        insert into playlists (kind, name, description, dominant_color, is_public, provider, provider_id, generator)
        values ('editorial', ${def.name}, ${def.description}, ${def.color}, true, 'melodify', ${def.key}, ${tx.json(generator)})
        on conflict (provider, provider_id) do update set
          name = excluded.name, description = excluded.description, dominant_color = excluded.dominant_color,
          generator = excluded.generator, updated_at = now()
        returning id`;
      await tx`delete from playlist_tracks where playlist_id = ${row!.id}`;
      await tx`insert into playlist_tracks ${tx(tracks.map((t, i) => ({ playlistId: row!.id, trackId: t.id, position: i + 1 })))}`;
    });
    made++;
  }
  return made;
}
