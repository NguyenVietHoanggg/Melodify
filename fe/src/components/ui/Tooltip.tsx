import type { ReactNode } from 'react';
import { Tooltip as T } from 'radix-ui';
import styles from './ui.module.css';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <T.Provider delayDuration={400} skipDelayDuration={200}>
      {children}
    </T.Provider>
  );
}

export function Tooltip({ label, children, side = 'top' }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (!label) return <>{children}</>;
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content className={styles.tooltip} side={side} sideOffset={8} collisionPadding={8}>
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
