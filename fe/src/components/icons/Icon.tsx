/**
 * Icon set drawn for this project on a 16×16 grid (Spotify's own icons are their design assets, so we
 * draw our own in the same visual language: 1.3–1.5px strokes, round caps, simple geometry).
 */
import type { ReactNode, SVGProps } from 'react';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const icons = {
  home: <path {...S} d="M2.2 7.1 8 2.2l5.8 4.9v6.7H9.9V10H6.1v3.8H2.2z" />,
  homeFilled: <path d="M8 1.4 1.5 6.9v7.6h5.1v-4.1h2.8v4.1h5.1V6.9z" />,
  search: (
    <>
      <circle {...S} strokeWidth={1.6} cx="7" cy="7" r="5" />
      <path {...S} strokeWidth={1.6} d="m10.8 10.8 3.6 3.6" />
    </>
  ),
  searchFilled: (
    <>
      <circle {...S} strokeWidth={2.2} cx="7" cy="7" r="4.6" />
      <path {...S} strokeWidth={2.2} d="m10.6 10.6 3.6 3.6" />
    </>
  ),
  browse: (
    <>
      <rect {...S} x="1.8" y="5.3" width="12.4" height="8.9" rx="1.6" />
      <path {...S} d="M4.2 2.4h7.6M6.2 9.7h3.6" />
    </>
  ),
  browseFilled: (
    <>
      <path d="M3.4 4.6h9.2c1 0 1.8.8 1.8 1.8v6.3c0 1-.8 1.8-1.8 1.8H3.4c-1 0-1.8-.8-1.8-1.8V6.4c0-1 .8-1.8 1.8-1.8zm2.8 4.4a.7.7 0 0 0 0 1.4h3.6a.7.7 0 0 0 0-1.4z" />
      <path {...S} d="M4.2 2.4h7.6" />
    </>
  ),
  library: (
    <>
      <path {...S} strokeWidth={1.6} d="M3 2.2v11.6M7 2.2v11.6" />
      <path {...S} strokeWidth={1.6} d="m10.2 2.6 3.3 11" />
    </>
  ),
  libraryCollapsed: (
    <>
      <rect {...S} x="2" y="2" width="12" height="12" rx="2" />
      <path {...S} d="M6.2 2v12" />
    </>
  ),
  plus: <path {...S} strokeWidth={1.5} d="M8 2.6v10.8M2.6 8h10.8" />,
  expand: <path {...S} d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />,
  collapse: <path {...S} d="M13.5 6.5h-4v-4M9.5 6.5 14 2M2.5 9.5h4v4M6.5 9.5 2 14" />,
  arrowLeft: <path {...S} strokeWidth={1.6} d="M10.5 2.8 5.3 8l5.2 5.2" />,
  arrowRight: <path {...S} strokeWidth={1.6} d="M5.5 2.8 10.7 8l-5.2 5.2" />,
  chevronDown: <path {...S} d="m3.5 6 4.5 4.5L12.5 6" />,
  chevronUp: <path {...S} d="m3.5 10 4.5-4.5 4.5 4.5" />,
  chevronRight: <path {...S} d="m6 3.5 4.5 4.5L6 12.5" />,
  close: <path {...S} strokeWidth={1.5} d="m3.6 3.6 8.8 8.8m0-8.8-8.8 8.8" />,
  more: (
    <>
      <circle cx="3" cy="8" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="13" cy="8" r="1.4" />
    </>
  ),
  check: <path {...S} strokeWidth={1.6} d="m2.8 8.4 3.3 3.2L13.2 4.4" />,
  addCircle: (
    <>
      <circle {...S} cx="8" cy="8" r="6.6" />
      <path {...S} d="M8 5v6M5 8h6" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="8" cy="8" r="7.3" />
      <path fill="none" stroke="#000" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" d="m4.8 8.2 2.2 2.2 4.3-4.6" />
    </>
  ),
  downloadCircle: (
    <>
      <circle {...S} cx="8" cy="8" r="6.6" />
      <path {...S} d="M8 4.6v6.2M5.4 8.4 8 11l2.6-2.6" />
    </>
  ),
  bell: (
    <>
      <path {...S} d="M8 1.9a3.9 3.9 0 0 0-3.9 3.9v2.7L2.8 10.8v.9h10.4v-.9l-1.3-2.3V5.8A3.9 3.9 0 0 0 8 1.9z" />
      <path {...S} d="M6.4 13.4a1.7 1.7 0 0 0 3.2 0" />
    </>
  ),
  friends: (
    <>
      <circle {...S} cx="6" cy="5" r="2.6" />
      <path {...S} d="M1.6 14c0-2.5 2-4.4 4.4-4.4s4.4 1.9 4.4 4.4" />
      <path {...S} d="M10.6 2.6a2.6 2.6 0 0 1 0 4.8M12.2 9.9c1.4.7 2.2 2.2 2.2 4.1" />
    </>
  ),
  user: (
    <>
      <circle {...S} cx="8" cy="5" r="3" />
      <path {...S} d="M2.4 14.4c0-3.1 2.5-5.4 5.6-5.4s5.6 2.3 5.6 5.4" />
    </>
  ),
  external: (
    <>
      <path {...S} d="M12.5 9v4.5h-10v-10H7" />
      <path {...S} d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5" />
    </>
  ),
  globe: (
    <>
      <circle {...S} cx="8" cy="8" r="6.3" />
      <path {...S} d="M1.7 8h12.6M8 1.7c1.8 1.8 2.6 3.9 2.6 6.3S9.8 12.5 8 14.3C6.2 12.5 5.4 10.4 5.4 8S6.2 3.5 8 1.7z" />
    </>
  ),
  pin: <path d="M10.4 1.2 14.8 5.6l-1.5.6-2.7 2.7-.3 2.9-1.3 1.3L6.3 10.4l-3.6 3.6-.7-.7 3.6-3.6L2.9 6.9l1.3-1.3 2.9-.3 2.7-2.7z" />,
  folder: <path {...S} d="M1.8 4.2c0-.8.6-1.4 1.4-1.4h3l1.6 1.8h5c.8 0 1.4.6 1.4 1.4v6.8c0 .8-.6 1.4-1.4 1.4H3.2c-.8 0-1.4-.6-1.4-1.4z" />,
  note: (
    <>
      <path {...S} d="M6 12.2V3l7-1.3v8.9" />
      <circle {...S} cx="4.4" cy="12.2" r="1.6" />
      <circle {...S} cx="11.4" cy="10.6" r="1.6" />
    </>
  ),
  playlistAdd: (
    <>
      <path {...S} d="M2 3.5h8M2 7.5h8M2 11.5h4.5" />
      <path {...S} d="M12 9v5M9.5 11.5h5" />
    </>
  ),
  listView: <path {...S} d="M2 3.5h12M2 8h12M2 12.5h12" />,
  compactView: <path {...S} d="M2 2.8h12M2 6.2h12M2 9.6h12M2 13h12" />,
  gridView: (
    <>
      <rect {...S} x="2" y="2" width="5" height="5" rx="1" />
      <rect {...S} x="9" y="2" width="5" height="5" rx="1" />
      <rect {...S} x="2" y="9" width="5" height="5" rx="1" />
      <rect {...S} x="9" y="9" width="5" height="5" rx="1" />
    </>
  ),
  sortList: <path {...S} d="M2 3.5h12M2 8h8M2 12.5h4" />,
  play: <path d="M3.8 2.4v11.2a.6.6 0 0 0 .9.5l9.1-5.6a.6.6 0 0 0 0-1L4.7 1.9a.6.6 0 0 0-.9.5z" />,
  pause: (
    <>
      <rect x="3.4" y="2.2" width="3.1" height="11.6" rx="0.8" />
      <rect x="9.5" y="2.2" width="3.1" height="11.6" rx="0.8" />
    </>
  ),
  next: <path d="M2.8 2.6v10.8a.55.55 0 0 0 .85.46L11 8.7V13a.9.9 0 0 0 1.8 0V3A.9.9 0 0 0 11 3v4.3L3.65 2.14a.55.55 0 0 0-.85.46z" />,
  previous: <path d="M13.2 2.6v10.8a.55.55 0 0 1-.85.46L5 8.7V13a.9.9 0 0 1-1.8 0V3A.9.9 0 0 1 5 3v4.3l7.35-5.16a.55.55 0 0 1 .85.46z" />,
  shuffle: (
    <>
      <path {...S} d="M1.6 4.4h2.2c1.2 0 2.2.6 2.9 1.5l2.6 4.2c.6 1 1.7 1.5 2.9 1.5h2.2M1.6 11.6h2.2c1.2 0 2.2-.6 2.9-1.5l2.6-4.2c.6-1 1.7-1.5 2.9-1.5h2.2" />
      <path {...S} d="m12.6 2.4 2 2-2 2M12.6 9.6l2 2-2 2" />
    </>
  ),
  smartShuffle: (
    <>
      <path {...S} d="M5.2 6.3 4.6 6c-.3-.4-.8-.6-1.3-.6H1.6M1.6 11.6h2.2c1.2 0 2.2-.6 2.9-1.5l2.6-4.2c.6-1 1.7-1.5 2.9-1.5h2.2M9.3 10.1c.6 1 1.7 1.5 2.9 1.5h2.2" />
      <path {...S} d="m12.6 2.4 2 2-2 2M12.6 9.6l2 2-2 2" />
      <path d="M4 .6c.2 1.3.7 1.8 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.2 1.8-.7 2-2z" />
    </>
  ),
  repeat: (
    <>
      <path {...S} d="M4.2 4.3h7.3a2.6 2.6 0 0 1 2.6 2.6v.4M11.8 11.7H4.5a2.6 2.6 0 0 1-2.6-2.6v-.4" />
      <path {...S} d="m9.6 2.2 2.1 2.1-2.1 2.1M6.4 13.8l-2.1-2.1 2.1-2.1" />
    </>
  ),
  repeatOne: (
    <>
      <path {...S} d="M4.2 4.3h3.3M11.8 11.7H4.5a2.6 2.6 0 0 1-2.6-2.6v-.4M14.1 8.2v.9a2.6 2.6 0 0 1-2.3 2.6" />
      <path {...S} d="M6.4 13.8l-2.1-2.1 2.1-2.1" />
      <path d="M11.3 1.2h1.3v5.6h-1.4V3l-1 .5V2.3z" />
    </>
  ),
  lyrics: (
    <>
      <path {...S} d="m13.4 2.6-.0 0a2.3 2.3 0 0 0-3.3 0L4.6 8.2l1.8 1.8 5.6-5.4a2.3 2.3 0 0 0 0-3.3" />
      <path {...S} d="M5.5 9.1 2.3 13.7" />
      <circle cx="11.6" cy="4.4" r="1.6" />
    </>
  ),
  queue: (
    <>
      <path {...S} d="M2 3.3h12M2 7.6h6.8M2 11.9h6.8" />
      <path d="M11.2 9v5.4l4-2.7z" />
    </>
  ),
  devices: (
    <>
      <rect {...S} x="1.8" y="1.8" width="7.6" height="12.4" rx="1.3" />
      <circle {...S} cx="5.6" cy="10" r="1.7" />
      <circle cx="5.6" cy="4.9" r="0.8" />
      <path {...S} d="M11.6 4.6h1.6c.6 0 1 .4 1 1v7.6c0 .6-.4 1-1 1h-1.6" />
    </>
  ),
  volumeHigh: (
    <>
      <path {...S} d="M1.8 6h2.6L8 3.1v9.8L4.4 10H1.8z" />
      <path {...S} d="M10.4 5.6a3.4 3.4 0 0 1 0 4.8M12.3 3.6a6.2 6.2 0 0 1 0 8.8" />
    </>
  ),
  volumeMedium: (
    <>
      <path {...S} d="M1.8 6h2.6L8 3.1v9.8L4.4 10H1.8z" />
      <path {...S} d="M10.4 5.6a3.4 3.4 0 0 1 0 4.8" />
    </>
  ),
  volumeLow: <path {...S} d="M1.8 6h2.6L8 3.1v9.8L4.4 10H1.8z" />,
  volumeOff: (
    <>
      <path {...S} d="M1.8 6h2.6L8 3.1v9.8L4.4 10H1.8z" />
      <path {...S} d="m10.6 6 3.8 4m0-4-3.8 4" />
    </>
  ),
  miniplayer: (
    <>
      <rect {...S} x="1.6" y="2.6" width="12.8" height="10.8" rx="1.6" />
      <rect x="8.2" y="8.2" width="4.6" height="3.6" rx="0.7" />
    </>
  ),
  fullscreen: <path {...S} d="M2.2 6V2.2H6M10 2.2h3.8V6M13.8 10v3.8H10M6 13.8H2.2V10" />,
  exitFullscreen: <path {...S} d="M6 2.2V6H2.2M13.8 6H10V2.2M10 13.8V10h3.8M2.2 10H6v3.8" />,
  nowPlayingView: (
    <>
      <rect {...S} x="1.6" y="2.6" width="12.8" height="10.8" rx="1.6" />
      <path {...S} d="M9.8 2.6v10.8" />
      <rect x="11" y="4.6" width="2.2" height="2.2" rx="0.4" />
    </>
  ),
  laptop: (
    <>
      <rect {...S} x="2.6" y="3" width="10.8" height="7.6" rx="1" />
      <path {...S} d="M1 13h14" />
    </>
  ),
  smartphone: (
    <>
      <rect {...S} x="4.4" y="1.6" width="7.2" height="12.8" rx="1.4" />
      <path {...S} d="M7.2 12.2h1.6" />
    </>
  ),
  speaker: (
    <>
      <rect {...S} x="3.4" y="1.6" width="9.2" height="12.8" rx="1.4" />
      <circle {...S} cx="8" cy="9.6" r="2.2" />
      <circle cx="8" cy="4.6" r="0.8" />
    </>
  ),
  tv: (
    <>
      <rect {...S} x="1.6" y="2.6" width="12.8" height="8.8" rx="1.2" />
      <path {...S} d="M5.4 14h5.2" />
    </>
  ),
  sparkle: <path d="M8 1.2c.45 3.3 1.95 4.8 5.3 5.3-3.35.45-4.85 1.95-5.3 5.3-.45-3.35-1.95-4.85-5.3-5.3C6.05 6 7.55 4.5 8 1.2z" />,
  verified: (
    <>
      <path d="M8 .9 9.6 2l1.9-.1.8 1.8 1.7.8-.1 1.9L15 8l-1.1 1.6.1 1.9-1.7.8-.8 1.8-1.9-.1L8 15.1 6.4 14l-1.9.1-.8-1.8L2 11.5l.1-1.9L1 8l1.1-1.6L2 4.5l1.7-.8.8-1.8 1.9.1z" fill="#4cb3ff" />
      <path fill="none" stroke="#fff" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" d="m5.2 8.1 1.9 1.9 3.8-4" />
    </>
  ),
  edit: <path {...S} d="M10.6 2.4a1.6 1.6 0 0 1 2.3 2.3L5.6 12l-3.1.8.8-3.1z" />,
  trash: (
    <>
      <path {...S} d="M2.4 4h11.2M6.2 4V2.4h3.6V4M3.8 4l.7 9.6h7l.7-9.6" />
    </>
  ),
  share: (
    <>
      <path {...S} d="M8 1.8v8.4M5 4.6l3-2.8 3 2.8" />
      <path {...S} d="M4.6 7.2H3.2v7h9.6v-7h-1.4" />
    </>
  ),
  link: (
    <>
      <path {...S} d="M6.9 9.1a2.6 2.6 0 0 0 3.7 0l2.5-2.5a2.6 2.6 0 0 0-3.7-3.7l-.8.8" />
      <path {...S} d="M9.1 6.9a2.6 2.6 0 0 0-3.7 0L2.9 9.4a2.6 2.6 0 0 0 3.7 3.7l.8-.8" />
    </>
  ),
  radio: (
    <>
      <circle cx="8" cy="8" r="1.6" />
      <path {...S} d="M5.2 5.2a4 4 0 0 0 0 5.6M10.8 5.2a4 4 0 0 1 0 5.6M3 3a7 7 0 0 0 0 10M13 3a7 7 0 0 1 0 10" />
    </>
  ),
  clock: (
    <>
      <circle {...S} cx="8" cy="8" r="6.4" />
      <path {...S} d="M8 4.4V8l2.4 1.6" />
    </>
  ),
  mix: (
    <>
      <path {...S} d="M1.6 10.5c1.6 0 2.3-5 4.1-5s2.5 5 4.6 5 2.5-5 4.1-5" />
      <path {...S} d="M1.6 5.5c1.6 0 2.3 5 4.1 5" opacity={0.55} />
    </>
  ),
  wand: (
    <>
      <path {...S} d="m2.4 13.6 8-8M9.2 4.4l2.4 2.4" />
      <path d="M12.6.9c.2 1 .6 1.4 1.6 1.6-1 .2-1.4.6-1.6 1.6-.2-1-.6-1.4-1.6-1.6 1-.2 1.4-.6 1.6-1.6zM5.4 1.8c.1.7.4 1 1.1 1.1-.7.1-1 .4-1.1 1.1-.1-.7-.4-1-1.1-1.1.7-.1 1-.4 1.1-1.1zM13.4 7.6c.1.7.4 1 1.1 1.1-.7.1-1 .4-1.1 1.1-.1-.7-.4-1-1.1-1.1.7-.1 1-.4 1.1-1.1z" />
    </>
  ),
  upload: (
    <>
      <path {...S} d="M8 10.6V2.2M5 5.1l3-2.9 3 2.9" />
      <path {...S} d="M2.2 10v3.8h11.6V10" />
    </>
  ),
  lock: (
    <>
      <rect {...S} x="3" y="7" width="10" height="7" rx="1.4" />
      <path {...S} d="M5.4 7V5a2.6 2.6 0 0 1 5.2 0v2" />
    </>
  ),
  info: (
    <>
      <circle {...S} cx="8" cy="8" r="6.4" />
      <path {...S} d="M8 7.2v4" />
      <circle cx="8" cy="4.9" r="0.9" />
    </>
  ),
  warning: (
    <>
      <path {...S} d="M8 1.9 14.6 13.6H1.4z" />
      <path {...S} d="M8 6.2v3.4" />
      <circle cx="8" cy="11.5" r="0.8" />
    </>
  ),
  language: (
    <>
      <circle {...S} cx="8" cy="8" r="6.3" />
      <path {...S} d="M1.7 8h12.6M8 1.7c1.8 1.8 2.6 3.9 2.6 6.3S9.8 12.5 8 14.3C6.2 12.5 5.4 10.4 5.4 8S6.2 3.5 8 1.7z" />
    </>
  ),
  podcast: (
    <>
      <circle {...S} cx="8" cy="6.6" r="1.8" />
      <path {...S} d="M8 8.4v5.8M4.4 10.2a5 5 0 1 1 7.2 0" />
    </>
  ),
  heart: <path {...S} d="M8 13.6S1.8 9.9 1.8 5.6A3.2 3.2 0 0 1 8 4.2a3.2 3.2 0 0 1 6.2 1.4c0 4.3-6.2 8-6.2 8z" />,
  heartFilled: <path d="M8 14.2S1.2 10.2 1.2 5.5A3.6 3.6 0 0 1 8 3.6a3.6 3.6 0 0 1 6.8 1.9c0 4.7-6.8 8.7-6.8 8.7z" />,
  card: (
    <>
      <rect {...S} x="1.4" y="3.2" width="13.2" height="9.6" rx="1.4" />
      <path {...S} d="M1.4 6.4h13.2M3.8 10.2h3" />
    </>
  ),
  wallet: (
    <>
      <path {...S} d="M2 4.6c0-.9.7-1.6 1.6-1.6h8.2v2.4" />
      <rect {...S} x="2" y="5.4" width="12" height="8" rx="1.4" />
      <circle cx="11" cy="9.4" r="0.9" />
    </>
  ),
  logOut: (
    <>
      <path {...S} d="M6.4 13.6H3.2c-.7 0-1.2-.5-1.2-1.2V3.6c0-.7.5-1.2 1.2-1.2h3.2" />
      <path {...S} d="M10.4 11.2 13.6 8l-3.2-3.2M13.6 8H6" />
    </>
  ),
  settings: (
    <>
      <circle {...S} cx="8" cy="8" r="2.1" />
      <path {...S} d="M8 1.6v1.6M8 12.8v1.6M14.4 8h-1.6M3.2 8H1.6M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1M12.5 12.5l-1.1-1.1M4.6 4.6 3.5 3.5" />
    </>
  ),
  eye: (
    <>
      <path {...S} d="M1.2 8S3.6 3.4 8 3.4 14.8 8 14.8 8 12.4 12.6 8 12.6 1.2 8 1.2 8z" />
      <circle {...S} cx="8" cy="8" r="2.2" />
    </>
  ),
  eyeOff: (
    <>
      <path {...S} d="M6.4 3.6A6.9 6.9 0 0 1 8 3.4C12.4 3.4 14.8 8 14.8 8a12 12 0 0 1-1.9 2.5M10.5 11.9A6.4 6.4 0 0 1 8 12.6C3.6 12.6 1.2 8 1.2 8a11.6 11.6 0 0 1 2.7-3.2" />
      <path {...S} d="M6.5 6.5a2.2 2.2 0 0 0 3 3M2 2l12 12" />
    </>
  ),
  image: (
    <>
      <rect {...S} x="1.8" y="2.6" width="12.4" height="10.8" rx="1.4" />
      <circle {...S} cx="5.6" cy="6.2" r="1.2" />
      <path {...S} d="m2.2 12.4 3.9-3.6 2.6 2.3 2.1-1.8 3.2 2.9" />
    </>
  ),
  mail: (
    <>
      <rect {...S} x="1.6" y="3.2" width="12.8" height="9.6" rx="1.4" />
      <path {...S} d="m2 4 6 4.7L14 4" />
    </>
  ),
  school: (
    <>
      <path {...S} d="M8 2.4 1.2 6 8 9.6 14.8 6z" />
      <path {...S} d="M4 7.6v3.3c1.1 1 2.5 1.5 4 1.5s2.9-.5 4-1.5V7.6M14.8 6v4.2" />
    </>
  ),
  sort: <path {...S} d="M4.6 2.6v10.8M2.4 11.2l2.2 2.2 2.2-2.2M11.4 13.4V2.6M9.2 4.8l2.2-2.2 2.2 2.2" />,
  flag: <path {...S} d="M3 14.4V2.2M3 2.6h8.8l-1.6 2.9 1.6 2.9H3" />,
  equalizer: <path d="M2 6h2.4v8H2zM6.8 2h2.4v12H6.8zM11.6 8.4H14V14h-2.4z" />,
} satisfies Record<string, ReactNode>;

/** Third-party brand marks keep their own colors (used on the log-in / sign-up buttons). */
export function ProviderLogo({ provider, size = 24 }: { provider: 'google' | 'facebook' | 'apple'; size?: number }) {
  if (provider === 'google') {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.36.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.61l3.99 3.1C6.22 6.86 8.87 4.75 12 4.75z" />
        <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.58l3.86 3c2.26-2.09 3.56-5.17 3.56-8.82z" />
        <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29l-3.99-3.1A11.94 11.94 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96l-3.99 3.1C3.26 21.31 7.31 24 12 24z" />
      </svg>
    );
  }
  if (provider === 'facebook') {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
        <circle cx="12" cy="12" r="12" fill="#1877F2" />
        <path fill="#fff" d="M16.67 15.47 17.2 12h-3.33V9.75c0-.95.47-1.88 1.95-1.88h1.51V4.92s-1.37-.23-2.68-.23c-2.74 0-4.53 1.66-4.53 4.66V12H7.08v3.47h3.04V24h3.75v-8.53z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="currentColor">
      <path d="M16.37 12.74c-.02-2.23 1.82-3.3 1.9-3.35-1.04-1.52-2.65-1.72-3.22-1.75-1.37-.14-2.68.81-3.37.81-.7 0-1.77-.79-2.91-.77-1.5.02-2.88.87-3.65 2.21-1.56 2.7-.4 6.7 1.12 8.89.74 1.07 1.62 2.27 2.78 2.23 1.12-.05 1.54-.72 2.89-.72s1.73.72 2.91.7c1.2-.02 1.96-1.09 2.7-2.17.85-1.24 1.2-2.45 1.22-2.51-.03-.01-2.34-.9-2.37-3.57zM14.15 6.18c.62-.75 1.03-1.78.92-2.82-.89.04-1.97.59-2.6 1.34-.57.66-1.07 1.71-.94 2.73.99.08 2-.5 2.62-1.25z" />
    </svg>
  );
}

export type IconName = keyof typeof icons;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  title?: string;
}

export function Icon({ name, size = 16, title, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title && <title>{title}</title>}
      {icons[name]}
    </svg>
  );
}
