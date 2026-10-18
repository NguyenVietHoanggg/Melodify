/**
 * Menus are described as DATA (MenuEntry[]) and rendered either as a right-click ContextMenu or as a
 * DropdownMenu behind a "…" button — one description, two ways to open it (exactly like Spotify).
 */
import { useState, type ReactElement, type ReactNode } from 'react';
import clsx from 'clsx';
import { ContextMenu as CM, DropdownMenu as DM } from 'radix-ui';
import { Icon, type IconName } from '../icons/Icon';
import styles from './ui.module.css';

export type MenuEntry =
  | {
      kind?: 'item';
      label: string;
      icon?: IconName;
      onSelect: () => void;
      disabled?: boolean;
      /** Shows a check (current sort order, view…). */
      checked?: boolean;
      external?: boolean;
      danger?: boolean;
    }
  | { kind: 'separator' }
  | { kind: 'label'; label: string }
  | { kind: 'sub'; label: string; icon?: IconName; entries?: MenuEntry[]; content?: ReactNode; filterPlaceholder?: string };

type Prims = typeof DM | typeof CM;

/** Submenu with a filter box on top (Spotify's "Add to playlist › Find a playlist"). */
function FilteredEntries({ P, entries, placeholder }: { P: Prims; entries: MenuEntry[]; placeholder: string }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLocaleLowerCase();
  const shown = needle
    ? entries.filter((e) => e.kind === undefined || e.kind === 'item' ? e.label.toLocaleLowerCase().includes(needle) : false)
    : entries;
  return (
    <>
      <div className={styles.menuSearch}>
        <Icon name="search" />
        <input
          autoFocus
          value={q}
          placeholder={placeholder}
          onChange={(e) => setQ(e.target.value)}
          // Keep typing inside the box instead of triggering the menu's type-ahead.
          onKeyDown={(e) => e.key !== 'Escape' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.stopPropagation()}
        />
      </div>
      <Entries P={P} entries={shown} />
    </>
  );
}

function Entries({ P, entries }: { P: Prims; entries: MenuEntry[] }) {
  return (
    <>
      {entries.map((e, i) => {
        if (e.kind === 'separator') return <P.Separator key={i} className={styles.menuSeparator} />;
        if (e.kind === 'label') return <P.Label key={i} className={styles.menuLabel}>{e.label}</P.Label>;
        if (e.kind === 'sub') {
          return (
            <P.Sub key={i}>
              <P.SubTrigger className={styles.menuItem}>
                {e.icon && <Icon name={e.icon} />}
                <span className={styles.menuText}>{e.label}</span>
                <Icon name="chevronRight" className={styles.menuTrail} />
              </P.SubTrigger>
              <P.Portal>
                <P.SubContent className={styles.menu} sideOffset={4} collisionPadding={8}>
                  {e.content ??
                    (e.filterPlaceholder ? (
                      <FilteredEntries P={P} entries={e.entries ?? []} placeholder={e.filterPlaceholder} />
                    ) : (
                      <Entries P={P} entries={e.entries ?? []} />
                    ))}
                </P.SubContent>
              </P.Portal>
            </P.Sub>
          );
        }
        return (
          <P.Item
            key={i}
            className={clsx(styles.menuItem, e.checked && styles.menuChecked, e.danger && styles.menuDanger)}
            disabled={e.disabled}
            onSelect={e.onSelect}
          >
            {e.icon && <Icon name={e.icon} />}
            <span className={styles.menuText}>{e.label}</span>
            {e.checked && <Icon name="check" className={styles.menuTrail} />}
            {e.external && <Icon name="external" className={styles.menuTrail} />}
          </P.Item>
        );
      })}
    </>
  );
}

export function DropdownMenu({
  trigger, entries, align = 'start', side = 'bottom', children,
}: { trigger: ReactElement; entries?: MenuEntry[]; align?: 'start' | 'end' | 'center'; side?: 'top' | 'bottom' | 'left' | 'right'; children?: ReactNode }) {
  return (
    <DM.Root modal={false}>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content className={styles.menu} align={align} side={side} sideOffset={6} collisionPadding={8}>
          {children ?? <Entries P={DM} entries={entries ?? []} />}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

/** Right-click menu. `entries` is a function so expensive menus are only built when opened. */
export function ContextMenu({ entries, children, disabled }: { entries: () => MenuEntry[]; children: ReactElement; disabled?: boolean }) {
  const [built, setBuilt] = useState<MenuEntry[]>([]);
  if (disabled) return children;
  return (
    <CM.Root modal={false} onOpenChange={(open) => open && setBuilt(entries())}>
      <CM.Trigger asChild>{children}</CM.Trigger>
      <CM.Portal>
        <CM.Content className={styles.menu} collisionPadding={8}>
          <Entries P={CM} entries={built} />
        </CM.Content>
      </CM.Portal>
    </CM.Root>
  );
}
