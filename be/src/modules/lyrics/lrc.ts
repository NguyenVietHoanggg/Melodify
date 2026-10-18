/** Pure LRC parsing — no I/O, so it is trivial to unit-test. */
export interface LyricsLine {
  t?: number;
  text: string;
}

export function parseLrc(lrc: string): LyricsLine[] {
  const out: LyricsLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) {
      const ms = (Number(m[1]) * 60 + Number(m[2])) * 1000 + Number((m[3] ?? '0').padEnd(3, '0'));
      out.push({ t: ms, text });
    }
  }
  return out.sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
}
