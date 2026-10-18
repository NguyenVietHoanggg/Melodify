import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import type { Card as CardData, Category } from '@contracts';
import { useRecentSearch } from '@/api/mutations';
import { useCategories, useMe, useRecentSearches, useSearch } from '@/api/queries';
import { PageFooter } from '@/components/layout/PageFooter';
import { CardSubtitle } from '@/components/media/Card';
import { Cover } from '@/components/media/Cover';
import { PlayButton } from '@/components/media/PlayButton';
import { CardGrid, Shelf } from '@/components/media/Shelf';
import { TrackList } from '@/components/tracks/TrackList';
import { Chip, Spinner } from '@/components/ui/Dialog';
import { del } from '@/lib/api';
import { contextOf, hrefOf } from '@/lib/links';
import { useQueryClient } from '@tanstack/react-query';
import page from '../page.module.css';
import styles from './search.module.css';

const TABS = [
  { id: '', key: 'search.all' },
  { id: 'tracks', key: 'search.songs', type: 'tracks' },
  { id: 'artists', key: 'search.artists', type: 'artists' },
  { id: 'playlists', key: 'search.playlists', type: 'playlists' },
  { id: 'albums', key: 'search.albums', type: 'albums' },
  { id: 'podcasts', key: 'search.podcasts', type: 'podcasts' },
  { id: 'episodes', key: 'search.episodes', type: 'episodes' },
  { id: 'users', key: 'search.profiles', type: 'profiles' },
  { id: 'uploads', key: 'search.uploads', type: 'uploads' },
] as const;

/** Same tab names as open.spotify.com (/search/q/tracks, /users…); older names still work. */
const TAB_ALIASES: Record<string, string> = { songs: 'tracks', profiles: 'users' };

export function CategoryCard({ c }: { c: Category }) {
  return (
    <Link to={`/genre/${c.id}`} className={styles.category} style={{ backgroundColor: c.color }}>
      <span className={styles.categoryName}>{c.name}</span>
      {c.imageUrl && <img className={styles.categoryImg} src={c.imageUrl} alt="" loading="lazy" />}
    </Link>
  );
}

function BrowseAll() {
  const { t } = useTranslation();
  const me = useMe();
  const qc = useQueryClient();
  const { data } = useCategories();
  const recent = useRecentSearches(Boolean(me));
  return (
    <div className={page.page}>
      {recent.data?.items.length ? (
        <div className={page.sections} style={{ paddingTop: 24 }}>
          <Shelf title={t('search.recent')} items={recent.data.items} fromSearch />
          <div style={{ padding: '0 12px' }}>
            <button
              type="button"
              className={styles.clearRecent}
              onClick={async () => {
                await del('/me/search/recent', {});
                void qc.invalidateQueries({ queryKey: ['recent-searches'] });
              }}
            >
              {t('search.clearRecent')}
            </button>
          </div>
        </div>
      ) : null}
      <div className={page.content}>
        <h2 className={page.sectionTitle} style={{ marginTop: 32 }}>{t('search.browseAll')}</h2>
        <div className={styles.categories}>
          {data?.items.map((c) => <CategoryCard key={c.id} c={c} />)}
        </div>
      </div>
      <PageFooter />
    </div>
  );
}

function TopResult({ card }: { card: CardData }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const recent = useRecentSearch();
  const me = useMe();
  const ctx = contextOf(card);
  const label = card.type === 'artist' ? t('card.artist') : card.type === 'track' ? t('card.song') : card.type === 'album' ? t('card.album') : card.type === 'playlist' ? t('card.playlist') : '';
  return (
    <div
      className={styles.top}
      onClick={() => {
        if (me && card.type !== 'collection' && card.type !== 'category') recent.mutate({ type: card.type, id: card.id });
        navigate(hrefOf(card.type, card.id));
      }}
      role="link"
    >
      <div className={clsx(styles.topImage, card.type === 'artist' && styles.round)}>
        <Cover imageUrl={card.imageUrl} mosaic={card.mosaic} mixCover={card.mixCover} round={card.type === 'artist'} radius="md" />
      </div>
      <h3 className={clsx(styles.topName, 'ellipsis')}>{card.name}</h3>
      <div className={styles.topMeta}>
        {card.type !== 'artist' && (
          <span className="ellipsis">
            <CardSubtitle card={card} />
          </span>
        )}
        <span className={styles.badge}>{label}</span>
      </div>
      {ctx && <PlayButton context={ctx} uri={card.uri} name={card.name} className={styles.topPlay} />}
    </div>
  );
}

function Results({ q, tab }: { q: string; tab: string }) {
  const { t } = useTranslation();
  const conf = TABS.find((x) => x.id === tab) ?? TABS[0];
  const type = 'type' in conf ? conf.type : 'all';
  const { data, isLoading, isFetching } = useSearch(q, type);
  if (isLoading || !data) return <div className={page.centered}><Spinner /></div>;

  const nothing =
    !data.topResult && !data.tracks.total && !data.artists.total && !data.albums.total && !data.playlists.total &&
    !data.profiles.total && !data.shows.total && !data.episodes.total && !data.uploads.total;
  if (nothing) {
    return (
      <div className={page.empty}>
        <h2>{t('search.noResults', { q })}</h2>
        <p className={page.muted}>{t('search.noResultsHint')}</p>
      </div>
    );
  }

  if (type === 'all') {
    return (
      <div style={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 200ms' }}>
        <div className={styles.topRow}>
          {data.topResult && (
            <section>
              <h2 className={styles.h2}>{t('search.topResult')}</h2>
              <TopResult card={data.topResult} />
            </section>
          )}
          {data.tracks.items.length > 0 && (
            <section className={styles.songs}>
              <h2 className={styles.h2}>
                <Link to={`/search/${encodeURIComponent(q)}/tracks`}>{t('search.songs')}</Link>
              </h2>
              <TrackList tracks={data.tracks.items} context={{ type: 'track', id: null, uri: 'melodify:search' }} rowContext columns={{ cover: true }} showHeader={false} />
            </section>
          )}
        </div>
        <div className={page.sections} style={{ marginTop: 24 }}>
          <Shelf title={t('search.artists')} seeAllPath={`/search/${encodeURIComponent(q)}/artists`} items={data.artists.items} fromSearch />
          <Shelf title={t('search.albums')} seeAllPath={`/search/${encodeURIComponent(q)}/albums`} items={data.albums.items} fromSearch />
          <Shelf title={t('search.playlists')} seeAllPath={`/search/${encodeURIComponent(q)}/playlists`} items={data.playlists.items} fromSearch />
          {data.uploads.items.length > 0 && (
            <section>
              <div className={styles.uploadsHead}>
                <h2 className={styles.h2}>
                  <Link to={`/search/${encodeURIComponent(q)}/uploads`}>{t('search.uploads')}</Link>
                </h2>
              </div>
              <div style={{ padding: '0 12px' }}>
                <TrackList tracks={data.uploads.items} context={{ type: 'track', id: null, uri: 'melodify:search-uploads' }} rowContext columns={{ cover: true }} showHeader={false} />
              </div>
            </section>
          )}
          <Shelf title={t('search.podcasts')} seeAllPath={`/search/${encodeURIComponent(q)}/podcasts`} items={data.shows.items} fromSearch />
          <Shelf title={t('search.episodes')} seeAllPath={`/search/${encodeURIComponent(q)}/episodes`} items={data.episodes.items} fromSearch />
          <Shelf title={t('search.profiles')} seeAllPath={`/search/${encodeURIComponent(q)}/users`} items={data.profiles.items} fromSearch />
        </div>
      </div>
    );
  }

  if (type === 'tracks' || type === 'uploads') {
    const list = type === 'tracks' ? data.tracks : data.uploads;
    return (
      <div className={page.content}>
        <TrackList tracks={list.items} context={{ type: 'track', id: null, uri: `melodify:search-${type}` }} rowContext columns={{ cover: true, album: type === 'tracks' }} stickyTop={56} />
      </div>
    );
  }
  const map = { artists: data.artists, albums: data.albums, playlists: data.playlists, podcasts: data.shows, episodes: data.episodes, profiles: data.profiles } as const;
  return (
    <div className={page.sections}>
      <CardGrid items={map[type as keyof typeof map].items} fromSearch />
    </div>
  );
}

export function SearchPage() {
  const params = useParams();
  const query = params.query;
  const tab = TAB_ALIASES[params.tab ?? ''] ?? params.tab ?? '';
  const { t } = useTranslation();
  const navigate = useNavigate();
  const q = query ? decodeURIComponent(query) : '';
  if (!q) return <BrowseAll />;
  return (
    <div className={page.page}>
      <div className={styles.chips}>
        {TABS.map((x) => (
          <Chip key={x.id} selected={tab === x.id} onClick={() => navigate(`/search/${encodeURIComponent(q)}${x.id ? `/${x.id}` : ''}`)}>
            {t(x.key)}
          </Chip>
        ))}
      </div>
      <Results q={q} tab={tab} />
      <PageFooter />
    </div>
  );
}
