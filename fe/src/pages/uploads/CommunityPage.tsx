/**
 * Community (/community): public uploads by Melodify users, kept apart from the commercial catalog.
 * Sort by newest / most played, filter by genre, each row plays on its own then Autoplay continues.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCommunityTracks, useMe, useUploadOptions } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { PageFooter } from '@/components/layout/PageFooter';
import { TrackList } from '@/components/tracks/TrackList';
import { Button } from '@/components/ui/Button';
import { Chip, Spinner } from '@/components/ui/Dialog';
import { BRAND } from '@/config/brand';
import page from '../page.module.css';
import styles from './uploads.module.css';

export function CommunityPage() {
  const { t } = useTranslation();
  const me = useMe();
  const options = useUploadOptions();
  const [sort, setSort] = useState<'new' | 'popular'>('new');
  const [genre, setGenre] = useState<string | null>(null);
  const q = useCommunityTracks(sort, genre);
  const tracks = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={page.page}>
      <header className={styles.communityHead}>
        <h1>{t('community.title')}</h1>
        <p>{t('community.subtitle', { app: BRAND.name })}</p>
      </header>
      <div className={styles.communityActions}>
        <Chip selected={sort === 'new'} onClick={() => setSort('new')}>{t('community.new')}</Chip>
        <Chip selected={sort === 'popular'} onClick={() => setSort('popular')}>{t('community.popular')}</Chip>
        <span className={styles.spacer} />
        {me && (
          <Link to="/uploads/new">
            <Button variant="white" icon="upload">{t('upload.uploadNew')}</Button>
          </Link>
        )}
      </div>
      <div className={styles.genreChips}>
        <Chip selected={!genre} onClick={() => setGenre(null)}>{t('community.allGenres')}</Chip>
        {(options.data?.genres ?? []).map((g) => (
          <Chip key={g} selected={genre === g} onClick={() => setGenre(genre === g ? null : g)}>
            {t(`genres.${g}`, { defaultValue: g })}
          </Chip>
        ))}
      </div>
      <div className={page.content}>
        {q.isLoading ? (
          <div className={page.centered}><Spinner /></div>
        ) : (
          <TrackList
            tracks={tracks}
            context={{ type: 'uploads', id: null, uri: `melodify:community:${sort}:${genre ?? 'all'}` }}
            columns={{ cover: true, plays: true, bpmKey: true }}
            rowContext
            stickyTop={0}
            empty={
              <div className={page.empty}>
                <Icon name="upload" size={56} />
                <h2>{t('community.emptyTitle')}</h2>
                <p className={page.muted}>{t('community.emptyBody')}</p>
                {me && <Link to="/uploads/new"><Button variant="white">{t('upload.uploadNew')}</Button></Link>}
              </div>
            }
          />
        )}
        <div ref={sentinel} />
        {q.isFetchingNextPage && <Spinner />}
      </div>
      <PageFooter />
    </div>
  );
}
