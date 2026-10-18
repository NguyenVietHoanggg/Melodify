/**
 * Every browser TAB is its own "device" (like Spotify, where two open tabs show up as two
 * "Web Player (Chrome)" entries in Connect). sessionStorage survives a reload of the same tab.
 */
const KEY = 'melodify.deviceId';

function makeId() {
  return `web-${(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 16)}`;
}

export const deviceId: string = (() => {
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const id = makeId();
    sessionStorage.setItem(KEY, id);
    return id;
  } catch {
    return makeId();
  }
})();

function browserName(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Browser';
}

export const deviceName = `Web Player (${browserName()})`;
