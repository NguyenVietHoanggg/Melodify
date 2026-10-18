import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { useFeedUnseen, useMe } from '@/api/queries';
import { LogoMark } from '@/components/brand/Logo';
import { Icon } from '@/components/icons/Icon';
import { Button, IconButton } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useUi } from '@/stores/ui';
import { UserMenu } from './UserMenu';
import styles from './topbar.module.css';

/** Parses /search/:query/:tab? into its parts. */
function searchFromPath(pathname: string) {
  const m = /^\/search(?:\/([^/]+))?(?:\/([^/]+))?/.exec(pathname);
  return m ? { query: decodeURIComponent(m[1] ?? ''), tab: m[2] ?? '' } : null;
}

function SearchBox() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const inSearch = searchFromPath(pathname);
  const [value, setValue] = useState(inSearch?.query ?? '');
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<number>(0);

  // Keep the box in sync when the URL changes (back/forward, clicking "Search").
  useEffect(() => {
    if (inSearch && inSearch.query !== value.trim()) setValue(inSearch.query);
    if (!inSearch) setValue('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Ctrl+K / Ctrl+L focuses search (Spotify uses Ctrl+K on the web player).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'l')) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onChange = (v: string) => {
    setValue(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const q = v.trim();
      const tab = searchFromPath(window.location.pathname)?.tab;
      navigate(q ? `/search/${encodeURIComponent(q)}${tab ? `/${tab}` : ''}` : '/search', { replace: Boolean(searchFromPath(window.location.pathname)?.query) });
    }, 250);
  };

  return (
    <div className={clsx(styles.search, inSearch && styles.searchActive)}>
      <Tooltip label={t('nav.search')}>
        <button type="button" className={styles.searchIcon} aria-label={t('nav.search')} onClick={() => input.current?.focus()}>
          <Icon name="search" size={24} />
        </button>
      </Tooltip>
      <input
        ref={input}
        className={styles.searchInput}
        value={value}
        placeholder={t('nav.searchPlaceholder')}
        aria-label={t('nav.searchPlaceholder')}
        maxLength={100}
        onFocus={() => !inSearch && navigate('/search')}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && input.current?.blur()}
      />
      {value && (
        <button type="button" className={styles.clear} aria-label={t('nav.clearSearch')} onClick={() => onChange('')}>
          <Icon name="close" size={24} />
        </button>
      )}
      <span className={styles.divider} />
      <Tooltip label={t('nav.browse')}>
        <Link to="/search" className={styles.browse} aria-label={t('nav.browse')}>
          <Icon name={inSearch && !inSearch.query ? 'browseFilled' : 'browse'} size={24} />
        </Link>
      </Tooltip>
    </div>
  );
}

export function TopBar() {
  const { t } = useTranslation();
  const me = useMe();
  const { pathname } = useLocation();
  const toggleRightPanel = useUi((s) => s.toggleRightPanel);
  const rightPanel = useUi((s) => s.rightPanel);
  const navigate = useNavigate();
  const unseen = useFeedUnseen(Boolean(me));

  return (
    <header className={styles.bar} data-testid="topbar">
      <Link to="/" className={styles.logo} aria-label="Melodify">
        <LogoMark size={32} />
      </Link>
      <div className={styles.center}>
        <Tooltip label={t('nav.home')}>
          <Link to="/" className={styles.home} aria-label={t('nav.home')}>
            <Icon name={pathname === '/' ? 'homeFilled' : 'home'} size={24} />
          </Link>
        </Tooltip>
        <SearchBox />
      </div>
      <div className={styles.right}>
        {me ? (
          <>
            {me.product === 'free' && (
              <Link to="/premium">
                <Button variant="white" size="sm" className={styles.premium}>
                  {t('nav.explorePremium')}
                </Button>
              </Link>
            )}
            <Link to="/download" className={styles.install}>
              <Icon name="downloadCircle" />
              <span>{t('nav.installApp')}</span>
            </Link>
            <IconButton
              icon="bell"
              label={t('nav.whatsNew')}
              active={pathname === '/content-feed'}
              className={clsx(styles.phoneHidden, (unseen.data?.count ?? 0) > 0 && pathname !== '/content-feed' && styles.unseen)}
              onClick={() => navigate('/content-feed')}
              tooltipSide="bottom"
            />
            <IconButton icon="friends" label={t('nav.friendActivity')} active={rightPanel === 'friends'} onClick={() => toggleRightPanel('friends')} tooltipSide="bottom" className={styles.phoneHidden} />
            <UserMenu me={me} />
          </>
        ) : (
          <>
            <nav className={styles.links}>
              <Link to="/premium">{t('nav.premium')}</Link>
              <a href="#support">{t('nav.support')}</a>
              <Link to="/download">{t('nav.download')}</Link>
            </nav>
            <span className={styles.vrule} />
            <Link to="/download" className={styles.install}>
              <Icon name="downloadCircle" />
              <span>{t('nav.installApp')}</span>
            </Link>
            <Link to="/signup" className={styles.signup}>
              {t('nav.signUp')}
            </Link>
            <Link to="/login">
              <Button variant="white" size="md" className={styles.login}>
                {t('nav.logIn')}
              </Button>
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
