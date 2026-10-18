import { BRAND } from '@/config/brand';

/** Melodify's mark: a green disc with four equalizer bars (original artwork, not Spotify's logo). */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={BRAND.name}>
      <circle cx="32" cy="32" r="32" fill={BRAND.accentColor} />
      <g fill="#000">
        <rect x="15" y="22" width="6" height="20" rx="3" />
        <rect x="25" y="15" width="6" height="34" rx="3" />
        <rect x="35" y="19" width="6" height="26" rx="3" />
        <rect x="45" y="25" width="6" height="14" rx="3" />
      </g>
    </svg>
  );
}

export function LogoFull({ height = 40 }: { height?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: height * 0.2, fontWeight: 800, fontSize: height * 0.62, letterSpacing: '-0.04em', color: '#fff' }}>
      <LogoMark size={height} />
      {BRAND.name}
    </span>
  );
}
