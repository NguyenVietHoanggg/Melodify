import type { MouseEvent } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import type { ContextType } from '@contracts';
import { pause, playContext, resume } from '@/player/commands';
import { usePlayer } from '@/player/store';
import { Icon } from '../icons/Icon';
import styles from './media.module.css';

interface PlayButtonProps {
  context: { type: ContextType; id: string | null };
  uri: string;
  name: string;
  offset?: { index?: number; trackId?: string };
  size?: 'small' | 'medium' | 'large';
  white?: boolean;
  className?: string;
  promptImage?: string | null;
  promptColor?: string | null;
}

/** The green circle. Shows "pause" when this exact context is what's playing. */
export function PlayButton({ context, uri, name, offset, size = 'medium', white, className, promptImage, promptColor }: PlayButtonProps) {
  const { t } = useTranslation();
  const isThis = usePlayer((s) => s.view?.context?.uri === uri);
  const playing = usePlayer((s) => Boolean(s.view?.isPlaying));
  const active = isThis && playing;
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isThis) void (playing ? pause() : resume());
    else void playContext({ context, offset, promptImage, promptColor });
  };
  return (
    <button
      type="button"
      className={clsx(styles.playButton, size !== 'medium' && styles[size], white && styles.white, className)}
      aria-label={active ? t('actions.pauseName', { name }) : t('actions.playName', { name })}
      onClick={onClick}
    >
      <Icon name={active ? 'pause' : 'play'} size={size === 'small' ? 16 : size === 'large' ? 24 : 20} />
    </button>
  );
}

export function Explicit() {
  return (
    <span className={styles.explicit} title="Explicit" aria-label="Explicit">
      E
    </span>
  );
}
