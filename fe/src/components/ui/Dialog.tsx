import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Dialog as D } from 'radix-ui';
import { Icon } from '../icons/Icon';
import styles from './ui.module.css';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  hideClose?: boolean;
}

export function Dialog({ open, onOpenChange, title, children, className, closeLabel = 'Close', hideClose }: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={styles.overlay} />
        <D.Content className={clsx(styles.dialog, className)} aria-describedby={undefined}>
          {title ? <D.Title className={styles.dialogTitle}>{title}</D.Title> : <D.Title className="visually-hidden">Dialog</D.Title>}
          {!hideClose && (
            <D.Close className={styles.dialogClose} aria-label={closeLabel}>
              <Icon name="close" />
            </D.Close>
          )}
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function Spinner({ size = 24 }: { size?: number }) {
  return <span className={styles.spinner} style={{ width: size, height: size }} role="status" aria-label="Loading" />;
}

export function Chip({ selected, children, onClick }: { selected?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" className={clsx(styles.chip, selected && styles.chipSelected)} aria-pressed={selected} onClick={onClick}>
      {children}
    </button>
  );
}
