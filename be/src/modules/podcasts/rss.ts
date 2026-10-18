/**
 * Podcasts are open: every show publishes an RSS feed (XML) listing its episodes and audio files.
 * This module downloads and normalises a feed. Used by the import script and the refresh job.
 */
import { XMLParser } from 'fast-xml-parser';

export interface FeedEpisode {
  guid: string;
  title: string;
  description: string | null;
  audioUrl: string;
  imageUrl: string | null;
  durationMs: number;
  releaseDate: string | null;
  explicit: boolean;
  season: number | null;
  episode: number | null;
}

export interface FeedShow {
  feedUrl: string;
  title: string;
  publisher: string | null;
  description: string | null;
  imageUrl: string | null;
  language: string | null;
  explicit: boolean;
  categories: string[];
  websiteUrl: string | null;
  episodes: FeedEpisode[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => name === 'item' || name === 'itunes:category',
  processEntities: true,
  htmlEntities: true,
});

type Node = string | number | { '#text'?: string | number; '@_href'?: string; '@_url'?: string; '@_text'?: string; [k: string]: unknown } | undefined | null;

const text = (v: Node): string | null => {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  const t = v['#text'];
  return t == null ? null : String(t).trim() || null;
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/**
 * Feeds put HTML in descriptions. We store PLAIN TEXT (paragraphs kept as blank lines) — rendering
 * third-party HTML in our page would be an XSS hole. The UI turns URLs back into safe links.
 */
export function htmlToText(html: string | null, max = 5000): string | null {
  if (!html) return null;
  const out = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_, href: string, label: string) => (label.includes(href) ? href : `${label} (${href})`))
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out ? out.slice(0, max) : null;
}

/** itunes:duration comes as "3723", "62:03" or "01:02:03". */
export function parseDuration(v: Node): number {
  const s = text(v);
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000);
  const parts = s.split(':').map(Number);
  if (parts.some((p) => Number.isNaN(p))) return 0;
  return Math.round(parts.reduce((acc, p) => acc * 60 + p, 0) * 1000);
}

const isExplicit = (v: Node) => /^(yes|true|explicit)$/i.test(text(v) ?? '');
const int = (v: Node) => {
  const n = Number.parseInt(text(v) ?? '', 10);
  return Number.isFinite(n) ? n : null;
};

export function parseFeed(xml: string, feedUrl: string, maxEpisodes = 50): FeedShow | null {
  const doc = parser.parse(xml) as { rss?: { channel?: Record<string, Node | Node[]> } };
  const ch = doc.rss?.channel as Record<string, any> | undefined;
  if (!ch) return null;
  const title = text(ch.title);
  if (!title) return null;
  const categories = ((ch['itunes:category'] ?? []) as Node[])
    .map((c) => (c && typeof c === 'object' ? (c['@_text'] as string | undefined) : undefined))
    .filter((c): c is string => Boolean(c));
  const showImage = ch['itunes:image']?.['@_href'] ?? text(ch.image?.url) ?? null;

  const episodes: FeedEpisode[] = [];
  for (const it of (ch.item ?? []) as Record<string, any>[]) {
    const audioUrl: string | undefined = it.enclosure?.['@_url'];
    const type: string = it.enclosure?.['@_type'] ?? 'audio/mpeg';
    if (!audioUrl || !/^https?:\/\//.test(audioUrl) || type.startsWith('video')) continue;
    const pub = text(it.pubDate);
    const date = pub ? new Date(pub) : null;
    episodes.push({
      guid: (text(it.guid) ?? audioUrl).slice(0, 500),
      title: text(it.title) ?? 'Episode',
      description: htmlToText(text(it['content:encoded']) ?? text(it.description) ?? text(it['itunes:summary'])),
      audioUrl,
      imageUrl: it['itunes:image']?.['@_href'] ?? null,
      durationMs: parseDuration(it['itunes:duration']),
      releaseDate: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
      explicit: isExplicit(it['itunes:explicit']),
      season: int(it['itunes:season']),
      episode: int(it['itunes:episode']),
    });
  }
  episodes.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
  return {
    feedUrl,
    title: title.slice(0, 300),
    publisher: text(ch['itunes:author']) ?? text(ch['itunes:owner']?.['itunes:name']) ?? null,
    description: htmlToText(text(ch.description) ?? text(ch['itunes:summary']), 4000),
    imageUrl: showImage,
    language: text(ch.language)?.slice(0, 10) ?? null,
    explicit: isExplicit(ch['itunes:explicit']),
    categories: [...new Set(categories)].slice(0, 5),
    websiteUrl: text(ch.link),
    episodes: episodes.slice(0, maxEpisodes),
  };
}

export async function fetchFeed(feedUrl: string, maxEpisodes = 50): Promise<FeedShow | null> {
  const res = await fetch(feedUrl, {
    headers: { 'user-agent': 'Melodify/0.1 (learning project; podcast fetcher)', accept: 'application/rss+xml, application/xml, text/xml, */*' },
    signal: AbortSignal.timeout(20_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  if (xml.length > 15_000_000) throw new Error('feed too large');
  return parseFeed(xml, feedUrl, maxEpisodes);
}
