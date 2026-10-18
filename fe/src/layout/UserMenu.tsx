import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { Me } from '@contracts';
import { DropdownMenu, type MenuEntry } from '@/components/ui/Menu';
import { Tooltip } from '@/components/ui/Tooltip';
import { post } from '@/lib/api';
import { usePlayer } from '@/player/store';
import styles from './usermenu.module.css';

export function UserMenu({ me }: { me: Me }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const logout = async () => {
    await post('/auth/logout');
    usePlayer.setState({ view: null });
    qc.clear();
    navigate('/');
    window.location.reload();
  };

  const entries: MenuEntry[] = [
    { label: t('userMenu.account'), onSelect: () => navigate('/account'), external: true },
    { label: t('userMenu.profile'), onSelect: () => navigate(`/user/${me.id}`) },
    { label: t('userMenu.recents'), onSelect: () => navigate('/recents') },
    ...(me.product === 'free' ? [{ label: t('userMenu.upgrade'), onSelect: () => navigate('/premium'), external: true } as MenuEntry] : []),
    { label: t('userMenu.uploads'), onSelect: () => navigate('/collection/uploads') },
    { label: t('userMenu.support'), onSelect: () => window.open('https://support.spotify.com', '_blank', 'noopener'), external: true },
    { label: t('userMenu.download'), onSelect: () => navigate('/download'), external: true },
    { label: t('userMenu.settings'), onSelect: () => navigate('/preferences') },
    { kind: 'separator' },
    { label: t('userMenu.logOut'), onSelect: () => void logout() },
  ];

  const initial = (me.displayName.trim()[0] ?? '?').toUpperCase();
  return (
    <DropdownMenu
      align="end"
      entries={entries}
      trigger={
        <button type="button" className={styles.avatarButton} aria-label={me.displayName} data-testid="user-widget-link">
          <Tooltip label={me.displayName} side="bottom">
            <span className={styles.avatar}>
              {me.avatarUrl ? <img src={me.avatarUrl} alt="" /> : <span className={styles.initial}>{initial}</span>}
            </span>
          </Tooltip>
        </button>
      }
    />
  );
}
