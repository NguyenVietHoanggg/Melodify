import sharp from 'sharp';

/**
 * Picks the color Spotify-style headers are painted with (the gradient behind a playlist/album title).
 *
 * 1. shrink the image to 48×48 and bucket pixels by color (5 bits per channel);
 * 2. score each bucket by population × saturation, ignoring near-black/near-white/grey pixels;
 * 3. clamp lightness & saturation so white text on top always stays readable.
 */
export async function headerColor(image: Buffer): Promise<string | null> {
  const { data, info } = await sharp(image).resize(48, 48, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = new Map<number, { r: number; g: number; b: number; n: number; s: number }>();
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const [, s, l] = rgbToHsl(r, g, b);
    if (l < 0.08 || l > 0.94) continue;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0, s: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.n += 1;
    bucket.s += s;
    buckets.set(key, bucket);
  }
  let best: { r: number; g: number; b: number; score: number } | null = null;
  for (const bk of buckets.values()) {
    const sat = bk.s / bk.n;
    const score = bk.n * (0.25 + sat);
    if (!best || score > best.score) best = { r: bk.r / bk.n, g: bk.g / bk.n, b: bk.b / bk.n, score };
  }
  if (!best) return '#535353';
  const [h, s, l] = rgbToHsl(best.r, best.g, best.b);
  return hslToHex(h, Math.min(s, 0.7), Math.min(Math.max(l, 0.22), 0.42));
}

export async function headerColorFromUrls(urls: (string | null | undefined)[], timeoutMs = 10_000): Promise<string | null> {
  for (const url of urls) {
    if (!url) continue;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) continue;
      return await headerColor(Buffer.from(await res.arrayBuffer()));
    } catch {
      // try the next mirror
    }
  }
  return null;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
