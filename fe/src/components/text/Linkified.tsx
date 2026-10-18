import { Fragment } from 'react';

const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g;

/**
 * Plain text with URLs turned into links — the SAFE way to show third-party descriptions (podcast feeds,
 * user bios): we never inject their HTML, so a malicious feed can't run scripts in our page.
 */
export function Linkified({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_RE);
  return (
    <span className={className} style={{ whiteSpace: 'pre-line' }}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" style={{ textDecoration: 'underline' }}>
            {part.length > 60 ? `${part.slice(0, 57)}…` : part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </span>
  );
}
