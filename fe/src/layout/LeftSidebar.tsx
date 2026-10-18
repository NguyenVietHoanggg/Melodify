import { useState } from 'react';
import clsx from 'clsx';
import { DropdownMenu as DM } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import type { LibraryEntry } from '@contracts';
import { useCreatePlaylist, useDeletePlaylist, usePin, useToggleSaved } from '@/api/mutations';
import { useLibrary, useMe } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { Cover } from '@/components/media/Cover';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Dialog';
import { ContextMenu, DropdownMenu, type MenuEntry } from '@/components/ui/Menu';
import { Tooltip } from '@/components/ui/Tooltip';
import { put } from '@/lib/api';
import { hrefOf } from '@/lib/links';
import { playContext } from '@/player/commands';
import { usePlayer } from '@/player/store';
import { useDialogs } from '@/stores/dialogs';
import { toast } from '@/stores/toast';
import { useUi, type LibraryFilter, type LibrarySort } from '@/stores/ui';
import { LanguageButton } from './LanguageDialog';
import { useFolders } from './useFolders';
import layout from './layout.module.css';
import styles from './library.module.css';

function entryHref(e: LibraryEntry) {
  if (e.type === 'collection') return hrefOf('collection', e.collection ?? 'liked');
  if (e.type === 'folder') return '#';
  return hrefOf(e.type, e.id);
}

function useEntryTitle() {
  const { t } = useTranslation();
  return (e: LibraryEntry) =>
    e.type === 'collection'
      ? e.collection === 'episodes' ? t('library.yourEpisodes') : e.collection === 'uploads' ? t('library.yourUploads') : t('library.likedSongs')
      : e.name;
}

function Subtitle({ e }: { e: LibraryEntry }) {
  const { t } = useTranslation();
  let text: string;
  switch (e.type) {
    case 'playlist': text = t('library.playlistSubtitle', { owner: e.ownerName ?? '' }); break;
    case 'collection':
      text = e.collection === 'episodes' ? t('library.episodesCount', { count: e.itemCount ?? 0 }) : `${t('card.playlist')} • ${t('library.songsCount', { count: e.itemCount ?? 0 })}`;
      break;
    case 'album': {
      const kind = e.releaseType === 'single' ? t('card.single') : e.releaseType === 'ep' ? t('card.ep') : t('card.album');
      text = `${kind} • ${(e.artists ?? []).map((a) => a.name).join(', ')}`;
      break;
    }
    case 'artist': text = t('card.artist'); break;
    case 'show': text = `${t('card.podcast')} • ${e.publisher ?? ''}`; break;
    case 'folder': text = t('library.createFolder'); break;
  }
  return (
    <span className={styles.subtitle}>
      {e.pinned && <Icon name="pin" size={12} className={styles.pin} />}
      <span className="ellipsis">{text}</span>
    </span>
  );
}

function useEntryMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pin = usePin();
  const saved = useToggleSaved();
  const deletePlaylist = useDeletePlaylist();
  const createPlaylist = useCreatePlaylist();
  const folders = useFolders();
  return (e: LibraryEntry): MenuEntry[] => {
    const pinEntry: MenuEntry = { label: e.pinned ? t('menu.unpin') : t('menu.pin'), icon: 'pin', onSelect: () => pin.mutate({ type: e.type, id: e.id, pinned: !e.pinned }) };
    const copy: MenuEntry = {
      label: t('menu.copyLink'), icon: 'link',
      onSelect: () => void navigator.clipboard.writeText(new URL(entryHref(e), location.origin).href).then(() => toast(t('actions.linkCopied'))),
    };
    switch (e.type) {
      case 'playlist':
        return [
          ...(e.isOwn
            ? [
                { label: t('menu.editDetails'), icon: 'edit', onSelect: () => navigate(`/playlist/${e.id}?edit=1`) } as MenuEntry,
                {
                  label: t('menu.delete'), icon: 'trash', danger: true,
                  onSelect: () => setTimeout(() => useDialogs.getState().openConfirm({
                    title: t('menu.deletePlaylistTitle'),
                    body: t('menu.deletePlaylistBody', { name: e.name }),
                    confirmLabel: t('menu.delete'),
                    danger: true,
                    onConfirm: () => deletePlaylist.mutate(e.id),
                  }), 0),
                } as MenuEntry,
              ]
            : [{ label: t('menu.removeFromLibrary'), icon: 'checkCircle', onSelect: () => saved.mutate({ type: 'playlist', id: e.id, saved: false }) } as MenuEntry]),
          {
            kind: 'sub', label: t('folder.moveTo'), icon: 'folder',
            entries: [
              { label: t('folder.newFolder'), icon: 'plus', onSelect: () => folders.create((f) => folders.move(e, f)) },
              ...(folders.folders.length ? [{ kind: 'separator' } as MenuEntry] : []),
              ...folders.folders.map((f): MenuEntry => ({ label: f.name, icon: 'folder', checked: e.folderId === f.id, onSelect: () => folders.move(e, f) })),
              ...(e.folderId ? [{ kind: 'separator' } as MenuEntry, { label: t('folder.removeFrom'), icon: 'close', onSelect: () => folders.move(e, null) } as MenuEntry] : []),
            ],
          },
          { kind: 'separator' },
          { label: t('menu.newPlaylist'), icon: 'playlistAdd', onSelect: () => createPlaylist.mutate({}) },
          { label: t('folder.createTitle'), icon: 'folder', onSelect: () => folders.create() },
          {
            label: t('menu.excludeTaste'), icon: 'close',
            onSelect: () => void put('/me/library/taste', { type: 'playlist', id: e.id, exclude: true }).then(() => toast(t('menu.excludeTaste'))),
          },
          pinEntry,
          { kind: 'separator' },
          copy,
        ];
      case 'album':
        return [{ label: t('menu.removeFromLibrary'), icon: 'checkCircle', onSelect: () => saved.mutate({ type: 'album', id: e.id, saved: false }) }, pinEntry, { kind: 'separator' }, copy];
      case 'artist':
        return [{ label: t('menu.unfollow'), icon: 'close', onSelect: () => saved.mutate({ type: 'artist', id: e.id, saved: false }) }, pinEntry, { kind: 'separator' }, copy];
      case 'show':
        return [{ label: t('menu.unfollow'), icon: 'close', onSelect: () => saved.mutate({ type: 'show', id: e.id, saved: false }) }, pinEntry];
      case 'folder':
        return [
          { label: t('menu.rename'), icon: 'edit', onSelect: () => folders.rename(e) },
          { label: t('folder.deleteMenu'), icon: 'trash', danger: true, onSelect: () => folders.remove(e) },
          { kind: 'separator' },
          pinEntry,
        ];
      default:
        return [pinEntry];
    }
  };
}

function LibraryItem({ e, view, collapsed }: { e: LibraryEntry; view: 'compact' | 'list' | 'grid'; collapsed: boolean }) {
  const navigate = useNavigate();
  const title = useEntryTitle()(e);
  const menu = useEntryMenu();
  const playingThis = usePlayer((s) => s.view?.context?.uri === e.uri);
  const isPlaying = usePlayer((s) => Boolean(s.view?.isPlaying));
  const href = entryHref(e);
  const round = e.type === 'artist';
  const cover = (
    <Cover
      imageUrl={e.imageUrl}
      mosaic={e.mosaic}
      mixCover={e.mixCover}
      collection={e.collection}
      round={round}
      radius="sm"
      fallbackIcon={e.type === 'artist' ? 'user' : e.type === 'folder' ? 'folder' : e.type === 'show' ? 'podcast' : 'note'}
    />
  );
  const play = () => {
    if (e.type === 'folder') return;
    const ctx = e.type === 'collection' ? { type: 'collection' as const, id: e.collection ?? 'liked' } : { type: e.type, id: e.id };
    void playContext({ context: ctx });
  };

  const row = (
    <Link
      to={href}
      className={clsx(styles.item, view === 'compact' && styles.vCompact, view === 'grid' && styles.vGrid, collapsed && styles.itemCollapsed, playingThis && styles.playing)}
      onDoubleClick={(ev) => {
        ev.preventDefault();
        play();
      }}
      onClick={(ev) => e.type === 'folder' && (ev.preventDefault(), navigate(`/folder/${e.id}`))}
      aria-label={title}
    >
      {(view !== 'compact' || collapsed) && <div className={clsx(styles.itemCover, round && styles.round)}>{cover}</div>}
      {!collapsed && (
        <div className={styles.itemText}>
          <span className={clsx(styles.title, 'ellipsis')}>{title}</span>
          {view === 'compact' ? null : <Subtitle e={e} />}
        </div>
      )}
      {!collapsed && playingThis && isPlaying && view !== 'grid' && <Icon name="volumeHigh" className={styles.speaker} />}
    </Link>
  );
  return (
    <li>
      <ContextMenu entries={() => menu(e)}>{collapsed ? <Tooltip label={title} side="right">{row}</Tooltip> : row}</ContextMenu>
    </li>
  );
}

function SortMenu() {
  const { t } = useTranslation();
  const { librarySort, setLibrarySort, libraryView, setLibraryView } = useUi();
  const sorts: LibrarySort[] = ['recents', 'added', 'alpha', 'creator'];
  const views = ['compact', 'list', 'grid'] as const;
  return (
    <DropdownMenu
      align="end"
      entries={[
        { kind: 'label', label: t('library.sort.by') },
        ...sorts.map((s) => ({ label: t(`library.sort.${s}`), checked: librarySort === s, onSelect: () => setLibrarySort(s) })),
        { kind: 'separator' },
        { kind: 'label', label: t('library.sort.viewAs') },
        ...views.map((v) => ({
          label: t(`library.sort.${v}`),
          icon: v === 'compact' ? ('compactView' as const) : v === 'list' ? ('listView' as const) : ('gridView' as const),
          checked: libraryView === v,
          onSelect: () => setLibraryView(v),
        })),
      ]}
      trigger={
        <button type="button" className={styles.sortButton}>
          <span>{t(`library.sort.${librarySort}`)}</span>
          <Icon name={libraryView === 'grid' ? 'gridView' : libraryView === 'compact' ? 'compactView' : 'listView'} />
        </button>
      }
    />
  );
}

/**
 * "+ Create": a popover menu rendered in a portal (so the narrow sidebar never clips it), closed with
 * Esc / click outside and fully keyboard-navigable — Radix handles all of that.
 */
function CreateMenu({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createPlaylist = useCreatePlaylist();
  const folders = useFolders();
  const me = useMe();
  const [open, setOpen] = useState(false);
  if (!me) {
    return <IconButton icon="plus" label={t('library.createPlaylist')} onClick={() => useUi.getState().showLoginPrompt({ kind: 'playlist' })} />;
  }
  const item = (icon: 'playlistAdd' | 'folder' | 'wand' | 'upload', title: string, desc: string, onSelect: () => void) => (
    <DM.Item className={styles.createItem} onSelect={onSelect}>
      <span className={styles.createIcon}>
        <Icon name={icon} size={20} />
      </span>
      <span className={styles.createText}>
        <strong>{title}</strong>
        <span>{desc}</span>
      </span>
    </DM.Item>
  );
  return (
    <DM.Root open={open} onOpenChange={setOpen}>
      <DM.Trigger asChild>
        {compact ? (
          <IconButton icon="plus" label={t('library.create')} className={styles.createPlusOnly} />
        ) : (
          <button type="button" className={styles.createButton}>
            <Icon name={open ? 'close' : 'plus'} />
            <span>{t('library.create')}</span>
          </button>
        )}
      </DM.Trigger>
      <DM.Portal>
        <DM.Content className={styles.createMenu} align="start" sideOffset={8} collisionPadding={8}>
          {item('playlistAdd', t('library.createPlaylist'), t('library.createPlaylistDesc'), () => createPlaylist.mutate({}))}
          {item('wand', t('library.aiPlaylist'), t('library.aiPlaylistDesc'), () => navigate('/ai-playlist'))}
          {item('upload', t('library.upload'), t('library.uploadDesc'), () => navigate('/uploads/new'))}
          <DM.Separator className={styles.createSep} />
          {item('folder', t('library.createFolder'), t('library.createFolderDesc'), () => folders.create())}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function LibraryBody({ collapsed, expanded }: { collapsed: boolean; expanded: boolean }) {
  const { t } = useTranslation();
  const { libraryFilter, setLibraryFilter, librarySort, libraryView } = useUi();
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const { data, isLoading } = useLibrary(libraryFilter, librarySort, q.trim(), true);
  const items = (data?.items ?? []).filter((e) => !e.folderId);
  const view = collapsed ? 'list' : expanded ? 'grid' : libraryView;
  const filters: Exclude<LibraryFilter, null>[] = ['playlists', 'artists', 'albums', 'podcasts'];
  const present = new Set((data?.items ?? []).map((e) => e.type));
  const shown = filters.filter((f) => f === 'playlists' || (f === 'artists' && present.has('artist')) || (f === 'albums' && present.has('album')) || (f === 'podcasts' && present.has('show')) || libraryFilter === f);

  return (
    <>
      {!collapsed && (
        <div className={styles.filters}>
          {libraryFilter && <IconButton icon="close" label={t('library.clearFilters')} className={styles.clearFilter} onClick={() => setLibraryFilter(null)} />}
          {(libraryFilter ? [libraryFilter] : shown).map((f) => (
            <Chip key={f} selected={libraryFilter === f} onClick={() => setLibraryFilter(libraryFilter === f ? null : f)}>
              {t(`library.filters.${f}`)}
            </Chip>
          ))}
        </div>
      )}
      <div className={clsx('scroll', styles.listScroll)}>
        {!collapsed && (
          <div className={styles.tools}>
            {searching ? (
              <div className={styles.searchBox}>
                <Icon name="search" />
                <input autoFocus value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} placeholder={t('library.searchIn')} onBlur={() => !q && setSearching(false)} />
              </div>
            ) : (
              <IconButton icon="search" label={t('library.searchIn')} onClick={() => setSearching(true)} />
            )}
            <SortMenu />
          </div>
        )}
        {isLoading ? (
          <ul className={styles.list}>
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className={styles.skeleton} />
            ))}
          </ul>
        ) : items.length === 0 && q ? (
          <p className={styles.empty}>{t('library.noResults')}</p>
        ) : (
          <ul className={clsx(styles.list, view === 'grid' && !collapsed && styles.gridList)}>
            {items.map((e) => (
              <LibraryItem key={`${e.type}:${e.id}`} e={e} view={view} collapsed={collapsed} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function LoggedOutLibrary() {
  const { t } = useTranslation();
  const show = useUi((s) => s.showLoginPrompt);
  return (
    <div className={clsx('scroll', styles.listScroll, styles.loggedOut)}>
      <section className={styles.promo}>
        <h3>{t('library.emptyPlaylistsTitle')}</h3>
        <p>{t('library.emptyPlaylistsBody')}</p>
        <Button variant="white" size="sm" onClick={() => show({ kind: 'playlist' })}>
          {t('loggedOut.createPlaylistPrompt')}
        </Button>
      </section>
      <section className={styles.promo}>
        <h3>{t('library.emptyPodcastsTitle')}</h3>
        <p>{t('library.emptyPodcastsBody')}</p>
        <Link to="/genre/podcasts">
          <Button variant="white" size="sm">{t('library.browsePodcasts')}</Button>
        </Link>
      </section>
      <footer className={styles.footer}>
        <nav className={styles.legal}>
          {(['legal', 'safety', 'privacy', 'cookies', 'aboutAds', 'accessibility'] as const).map((k) => (
            <a key={k} href={`#${k}`}>{t(`footer.${k}`)}</a>
          ))}
        </nav>
        <a href="#cookies" className={styles.cookies}>{t('footer.cookies')}</a>
        <LanguageButton />
      </footer>
    </div>
  );
}

/**
 * "Your Library". Three ways to show it: the sidebar (desktop), a strip of icons that can't be widened
 * (tablet, `forceCollapsed` — its library button opens the full page instead) and a page of its own
 * (`asPage`, the Library tab on phones).
 */
export function LeftSidebar({ asPage, forceCollapsed }: { asPage?: boolean; forceCollapsed?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useMe();
  const ui = useUi();
  const { toggleLeftCollapsed, setLeftExpanded } = ui;
  const leftCollapsed = !asPage && (forceCollapsed || ui.leftCollapsed);
  const leftExpanded = !asPage && !forceCollapsed && ui.leftExpanded;
  const toggleLabel = forceCollapsed ? t('library.title') : leftCollapsed ? t('library.expand') : t('library.collapse');
  return (
    <nav
      className={clsx(asPage ? styles.asPage : [layout.panel, layout.left], styles.sidebar, leftCollapsed && styles.collapsed)}
      aria-label={t('library.title')}
      data-testid={asPage ? 'library-page' : 'left-sidebar'}
    >
      <header className={styles.header}>
        <Tooltip label={toggleLabel} side="right">
          <button
            type="button"
            className={styles.titleButton}
            onClick={asPage ? undefined : forceCollapsed ? () => navigate('/collection') : toggleLeftCollapsed}
            aria-label={asPage ? undefined : toggleLabel}
            aria-expanded={asPage || forceCollapsed ? undefined : !leftCollapsed}
          >
            <Icon name={leftCollapsed ? 'library' : 'libraryCollapsed'} size={24} className={styles.titleIcon} />
            {!leftCollapsed && <span>{t('library.title')}</span>}
          </button>
        </Tooltip>
        {!leftCollapsed && (
          <div className={styles.headerActions}>
            <CreateMenu />
            {me && !asPage && !forceCollapsed && (
              <IconButton
                icon={leftExpanded ? 'collapse' : 'expand'}
                label={leftExpanded ? t('library.showLess') : t('library.showMore')}
                onClick={() => setLeftExpanded(!leftExpanded)}
              />
            )}
          </div>
        )}
        {leftCollapsed && me && <CreateMenu compact />}
      </header>
      {me ? <LibraryBody collapsed={leftCollapsed} expanded={leftExpanded} /> : !leftCollapsed && <LoggedOutLibrary />}
    </nav>
  );
}
