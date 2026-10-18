/**
 * Locale-aware formatting helpers, matching how Spotify writes numbers & durations:
 *   vi: "118.097 lượt lưu", "khoảng 3 giờ 15 phút", "1,9 Tr người nghe hằng tháng", "11 thg 10, 2026"
 *   en: "118,097 saves",    "about 3 hr 15 min",    "1.9M monthly listeners",       "Oct 11, 2026"
 */
export type Locale = 'vi' | 'en';

const intlLocale = (l: Locale) => (l === 'vi' ? 'vi-VN' : 'en-US');

/** 183000 → "3:03", 3723000 → "1:02:03" (player & tracklist durations). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Playlist header total: ≥1h → "about 3 hr 15 min"; otherwise "23 min 15 sec". */
export function formatTotalDuration(ms: number, locale: Locale): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (locale === 'vi') {
    if (h > 0) return `khoảng ${h} giờ ${m} phút`;
    return `${m} phút ${s} giây`;
  }
  if (h > 0) return `about ${h} hr ${m} min`;
  return `${m} min ${s} sec`;
}

export function formatNumber(n: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(n);
}

/** 1907255 → "1,9 Tr" (vi) / "1.9M" (en). */
export function formatCompact(n: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** 65000 → "65.000 ₫" */
export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)} ₫`;
}

/** "11 thg 10, 2026" / "Oct 11, 2026" */
export function formatDate(iso: string | Date, locale: Locale): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

/** "3 ngày trước" for recent dates (Spotify's "Date added" column), absolute date after ~4 weeks. */
export function formatAddedAt(iso: string, locale: Locale, now: Date = new Date()): string {
  const d = new Date(iso);
  const diffSec = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' });
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diffSec / 86400), 'day');
  if (abs < 86400 * 28) return rtf.format(Math.round(diffSec / (86400 * 7)), 'week');
  return formatDate(d, locale);
}

export function releaseYear(date: string | null | undefined): string {
  return date ? String(new Date(date).getFullYear()) : '';
}

/** Podcast lengths the way Spotify writes them: "1 giờ 2 phút" / "45 phút" — "1 hr 2 min" / "45 min". */
export function formatEpisodeLength(ms: number, locale: Locale): string {
  const totalMin = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (locale === 'vi') return h ? `${h} giờ${m ? ` ${m} phút` : ''}` : `${m} phút`;
  return h ? `${h} hr${m ? ` ${m} min` : ''}` : `${m} min`;
}

/** "18 thg 9" for this year, "18 thg 9, 2024" otherwise (episode dates). */
export function formatShortDate(iso: string, locale: Locale, now: Date = new Date()): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).format(d);
}
