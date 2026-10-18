import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ContextType, Track, TransitionRecipe } from '@contracts';
import { useToggleLike } from '@/api/mutations';
import { useLikedIds, useMe } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { ArtistLinks } from '@/components/media/Card';
import { Cover } from '@/components/media/Cover';
import { Explicit } from '@/components/media/PlayButton';
import { ContextMenu, DropdownMenu, type MenuEntry } from '@/components/ui/Menu';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatAddedAt, formatDuration, formatNumber } from '@/lib/format';
import { useMainScroll } from '@/layout/MainView';
import { pause, playContext, resume } from '@/player/commands';
import { usePlayer } from '@/player/store';
import { useTrackMenu, type TrackMenuOptions } from './useTrackMenu';
import styles from './tracklist.module.css';

export type ListTrack = Track & { itemId?: string; addedAt?: string; transition?: TransitionRecipe | null; isRecommendation?: boolean };

export interface Columns {
  cover?: boolean;
  album?: boolean;
  dateAdded?: boolean;
  plays?: boolean;
  bpmKey?: boolean;
}

interface TrackListProps {
  tracks: ListTrack[];
  context: { type: ContextType; id: string | null; uri: string };
  columns: Columns;
  /** How the backend should find the start: by index (playlist/album) or by track id (liked songs…). */
  offsetBy?: 'index' | 'trackId';
  playlistId?: string;
  canEdit?: boolean;
  showHeader?: boolean;
  compact?: boolean;
  onTransitionClick?: (track: ListTrack, next: ListTrack) => void;
  onAddRecommendation?: (track: ListTrack) => void;
  /** Each row is its own context (search results, recommendations): play just that song, then Autoplay. */
  rowContext?: boolean;
  /** Index shown for the first row (artist "Popular" starts at 1 even when paged). */
  startIndex?: number;
  empty?: ReactNode;
  /**
   * Where the column header sticks while scrolling: 64 = under the page's coloured StickyBar (playlist,
   * album…), 56 = under Search's tab chips, 0 = pages without a sticky bar.
   */
  stickyTop?: number;
}

/**
 * Spotify only paints the column header once it is *stuck* (before that it floats over the header gradient).
 * A 1px sentinel right above it leaves the visible area exactly when the header reaches `top`.
 */
function useStuck(scrollRef: React.RefObject<HTMLElement | null>, top: number, enabled: boolean) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    const root = scrollRef.current;
    if (!enabled || !el || !root) return;
    const io = new IntersectionObserver(
      ([e]) => setStuck(Boolean(e && !e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0) + 1)),
      { root, rootMargin: `-${top}px 0px 0px 0px`, threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scrollRef, top, enabled]);
  return [sentinel, stuck] as const;
}

const TEMPLATE = (c: Columns) =>
  [
    '[index] 16px',
    '[first] minmax(120px, 6fr)',
    c.album ? '[album] minmax(120px, 4fr)' : '',
    c.plays ? '[plays] minmax(80px, 2fr)' : '',
    c.bpmKey ? '[bpm] minmax(80px, 1.4fr)' : '',
    c.dateAdded ? '[added] minmax(110px, 3fr)' : '',
    '[last] minmax(120px, 1fr)',
  ]
    .filter(Boolean)
    .join(' ');

/** Smallest width each optional column needs, in the order they are dropped when space runs out. */
const OPTIONAL: { key: 'bpmKey' | 'plays' | 'dateAdded' | 'album'; min: number }[] = [
  { key: 'bpmKey', min: 80 },
  { key: 'plays', min: 80 },
  { key: 'dateAdded', min: 110 },
  { key: 'album', min: 120 },
];
const GAP = 16;
// Row padding (2 × 16) + # column + a comfortable title (220) + the like/duration/more column (120).
const BASE = 32 + 16 + GAP + 220 + GAP + 120;

/**
 * Like Spotify: when the list gets narrow (both side panels open, small window) the less important
 * columns disappear one by one instead of the list scrolling sideways.
 */
function useResponsiveColumns(box: HTMLElement | null, columns: Columns): Columns {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!box) return;
    setWidth(box.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width));
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);
  return useMemo(() => {
    if (width === null) return columns;
    const shown = { ...columns };
    const need = () => BASE + OPTIONAL.reduce((sum, c) => sum + (shown[c.key] ? c.min + GAP : 0), 0);
    for (const c of OPTIONAL) {
      if (need() <= width) break;
      shown[c.key] = false;
    }
    return shown;
  }, [columns, width]);
}

interface RowProps {
  track: ListTrack;
  index: number;
  displayIndex: number;
  columns: Columns;
  isCurrent: boolean;
  isPlaying: boolean;
  isLiked: boolean;
  signedIn: boolean;
  compact?: boolean;
  menu: () => MenuEntry[];
  onPlay: () => void;
  onToggleLike: () => void;
  onAdd?: () => void;
}

const Row = memo(function Row({ track, displayIndex, columns, isCurrent, isPlaying, isLiked, signedIn, compact, menu, onPlay, onToggleLike, onAdd }: RowProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const [selected, setSelected] = useState(false);
  return (
    <ContextMenu entries={menu}>
      <div
        className={clsx(styles.row, isCurrent && styles.current, selected && styles.selected, compact && styles.compactRow, !track.isPlayable && styles.disabled)}
        style={{ gridTemplateColumns: TEMPLATE(columns) }}
        role="row"
        aria-selected={selected}
        tabIndex={-1}
        onClick={() => setSelected(true)}
        onBlur={() => setSelected(false)}
        onDoubleClick={onPlay}
        data-testid="tracklist-row"
      >
        <div className={styles.index} role="gridcell">
          <span className={styles.number}>
            {isCurrent && isPlaying ? (
              <span className="eq-bars" aria-hidden>
                <i />
                <i />
                <i />
              </span>
            ) : track.isRecommendation ? (
              <Icon name="sparkle" className={styles.sparkle} />
            ) : (
              displayIndex
            )}
          </span>
          <button
            type="button"
            className={styles.rowPlay}
            aria-label={isCurrent && isPlaying ? t('actions.pauseName', { name: track.title }) : t('actions.playName', { name: track.title })}
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
          >
            <Icon name={isCurrent && isPlaying ? 'pause' : 'play'} />
          </button>
        </div>
        <div className={styles.first} role="gridcell">
          {columns.cover && (
            <div className={styles.cover}>
              <Cover imageUrl={track.album?.coverUrl} radius="sm" />
            </div>
          )}
          <div className={styles.titles}>
            <Link to={track.album ? `/album/${track.album.id}` : `/track/${track.id}`} className={clsx(styles.title, 'ellipsis')} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
              {track.title}
            </Link>
            {!compact && (
              <span className={clsx(styles.sub, 'ellipsis')}>
                {track.explicit && <Explicit />}
                {track.origin === 'upload' && track.visibility === 'private' && <Icon name="lock" size={12} />}
                <ArtistLinks artists={track.artists} />
              </span>
            )}
          </div>
        </div>
        {columns.album && (
          <div className={clsx(styles.cell, 'ellipsis')} role="gridcell">
            {track.album && (
              <Link to={`/album/${track.album.id}`} className={styles.subLink} onClick={(e) => e.stopPropagation()}>
                {track.album.title}
              </Link>
            )}
          </div>
        )}
        {columns.plays && (
          <div className={styles.cell} role="gridcell">
            {formatNumber(track.playCount, lang)}
          </div>
        )}
        {columns.bpmKey && (
          <div className={clsx(styles.cell, styles.mono)} role="gridcell">
            {track.features.bpm ?? '–'} · {track.features.camelot ?? '–'}
          </div>
        )}
        {columns.dateAdded && (
          <div className={styles.cell} role="gridcell">
            {track.addedAt ? formatAddedAt(track.addedAt, lang) : ''}
          </div>
        )}
        <div className={styles.last} role="gridcell">
          {onAdd ? (
            <button type="button" className={styles.addButton} onClick={(e) => (e.stopPropagation(), onAdd())}>
              {t('tracklist.add')}
            </button>
          ) : (
            signedIn && (
              <Tooltip label={isLiked ? t('tracklist.removeFromLiked') : t('tracklist.addToLiked')}>
                <button
                  type="button"
                  className={clsx(styles.like, isLiked && styles.liked)}
                  aria-label={isLiked ? t('tracklist.removeFromLiked') : t('tracklist.addToLiked')}
                  onClick={(e) => (e.stopPropagation(), onToggleLike())}
                >
                  <Icon name={isLiked ? 'checkCircle' : 'addCircle'} />
                </button>
              </Tooltip>
            )
          )}
          <span className={styles.duration}>{formatDuration(track.durationMs)}</span>
          <span onClick={(e) => e.stopPropagation()}>
            <DropdownMenu
              align="end"
              entries={menu()}
              trigger={
                <button type="button" className={styles.more} aria-label={t('actions.moreOptions', { name: track.title })}>
                  <Icon name="more" />
                </button>
              }
            />
          </span>
        </div>
      </div>
    </ContextMenu>
  );
});

function TransitionPill({ recipe, onClick }: { recipe: TransitionRecipe; onClick?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className={styles.transition}>
      <button type="button" className={styles.pill} onClick={onClick} disabled={!onClick}>
        <Icon name="mix" size={14} />
        <span>{t(`mix.presets.${recipe.preset}`, { defaultValue: recipe.preset })}</span>
        <span className={styles.pillTime}>{Math.round(recipe.durationMs / 1000)}s</span>
        {recipe.auto && <span className={styles.pillAuto}>Auto</span>}
      </button>
    </div>
  );
}

export function TrackList(props: TrackListProps) {
  const { tracks, context, offsetBy = 'index', playlistId, canEdit, showHeader = true, compact, onTransitionClick, onAddRecommendation, startIndex = 1, empty, rowContext, stickyTop = 64 } = props;
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const columns = useResponsiveColumns(box, props.columns);
  const { t } = useTranslation();
  const me = useMe();
  const liked = useLikedIds(Boolean(me));
  const toggleLike = useToggleLike();
  const buildMenu = useTrackMenu();
  const currentTrackId = usePlayer((s) =>
    rowContext ? (s.view?.context?.type === 'track' ? s.view?.current?.track?.id : null) : s.view?.context?.uri === context.uri ? s.view?.current?.track?.id : null,
  );
  const isPlaying = usePlayer((s) => Boolean(s.view?.isPlaying));
  const scrollRef = useMainScroll();
  const listRef = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  const virtual = tracks.length > 80 && !onTransitionClick;
  const [sentinel, stuck] = useStuck(scrollRef, stickyTop, showHeader && tracks.length > 0);

  useEffect(() => {
    if (!virtual) return;
    const update = () => {
      const list = listRef.current;
      const scroller = scrollRef.current;
      if (list && scroller) setMargin(list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop);
    };
    update();
    const ro = new ResizeObserver(update);
    if (scrollRef.current) ro.observe(scrollRef.current);
    return () => ro.disconnect();
  }, [virtual, scrollRef]);

  const virtualizer = useVirtualizer({
    count: virtual ? tracks.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (compact ? 32 : 56),
    overscan: 12,
    scrollMargin: margin,
  });

  if (!tracks.length) return <>{empty ?? null}</>;

  const play = (track: ListTrack, index: number) => {
    if (currentTrackId === track.id) return void (isPlaying ? pause() : resume());
    void playContext({
      context: rowContext ? { type: 'track', id: track.id } : { type: context.type, id: context.id },
      offset: rowContext ? undefined : offsetBy === 'index' ? { index } : { trackId: track.id },
      promptImage: track.album?.coverUrl,
    });
  };

  const renderRow = (track: ListTrack, i: number) => {
    const opts: TrackMenuOptions = { playlistId, itemId: track.itemId, canEdit, isRecommendation: track.isRecommendation };
    return (
      <Row
        track={track}
        index={i}
        displayIndex={startIndex + i}
        columns={columns}
        isCurrent={currentTrackId === track.id}
        isPlaying={isPlaying}
        isLiked={liked.data?.has(track.id) ?? false}
        signedIn={Boolean(me)}
        compact={compact}
        menu={() => buildMenu(track, opts)}
        onPlay={() => play(track, i)}
        onToggleLike={() => toggleLike.mutate({ ids: [track.id], liked: !(liked.data?.has(track.id) ?? false) })}
        onAdd={track.isRecommendation && onAddRecommendation ? () => onAddRecommendation(track) : undefined}
      />
    );
  };

  return (
    <div ref={setBox} className={styles.list} role="grid" aria-rowcount={tracks.length} data-testid="track-list">
      {showHeader && <div ref={sentinel} className={styles.sentinel} aria-hidden />}
      {showHeader && (
        <div className={clsx(styles.header, stuck && styles.headerStuck)} style={{ gridTemplateColumns: TEMPLATE(columns), top: stickyTop }} role="row">
          <div className={styles.index}>#</div>
          <div>{t('tracklist.title')}</div>
          {columns.album && <div>{t('tracklist.album')}</div>}
          {columns.plays && <div>{t('tracklist.plays')}</div>}
          {columns.bpmKey && <div>{t('tracklist.bpm')} · Camelot</div>}
          {columns.dateAdded && <div>{t('tracklist.dateAdded')}</div>}
          <div className={styles.last}>
            <Tooltip label={t('tracklist.duration')}>
              <span className={styles.clock}>
                <Icon name="clock" />
              </span>
            </Tooltip>
          </div>
        </div>
      )}
      {virtual ? (
        <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((v) => (
            <div key={tracks[v.index]!.itemId ?? `${tracks[v.index]!.id}-${v.index}`} style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${v.start - margin}px)` }}>
              {renderRow(tracks[v.index]!, v.index)}
            </div>
          ))}
        </div>
      ) : (
        <div ref={listRef}>
          {tracks.map((track, i) => (
            <Fragment key={track.itemId ?? `${track.id}-${i}`}>
              {renderRow(track, i)}
              {track.transition && tracks[i + 1] && (
                <TransitionPill recipe={track.transition} onClick={onTransitionClick ? () => onTransitionClick(track, tracks[i + 1]!) : undefined} />
              )}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
