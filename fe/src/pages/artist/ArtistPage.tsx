import { useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import type { Card } from '@contracts';
import { useRadio, useToggleSaved } from '@/api/mutations';
import { useArtistPage, useLikedIds, useMe, useSavedIds } from '@/api/queries';
import { ActionBar, EntityBody, EntityHeader } from '@/components/entity/EntityHeader';
import { StickyBar } from '@/components/entity/StickyBar';
import entity from '@/components/entity/entity.module.css';
import { Icon } from '@/components/icons/Icon';
import { PageFooter } from '@/components/layout/PageFooter';
import { PlayButton } from '@/components/media/PlayButton';
import { Shelf } from '@/components/media/Shelf';
import { TrackList } from '@/components/tracks/TrackList';
import { Button } from '@/components/ui/Button';
import { Chip, Dialog, Spinner } from '@/components/ui/Dialog';
import { DropdownMenu } from '@/components/ui/Menu';
import { Tooltip } from '@/components/ui/Tooltip';
import { BRAND } from '@/config/brand';
import { formatNumber } from '@/lib/format';
import { cycleShuffle } from '@/player/commands';
import { usePlayer } from '@/player/store';
import { toast } from '@/stores/toast';
import page from '../page.module.css';
import styles from './artist.module.css';

type Group = 'popular' | 'albums' | 'singles' | 'compilations';

export function ArtistPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const me = useMe();
  const { data, isLoading } = useArtistPage(id);
  const saved = useSavedIds(Boolean(me));
  const liked = useLikedIds(Boolean(me));
  const toggleSaved = useToggleSaved();
  const radio = useRadio();
  const shuffle = usePlayer((s) => s.view?.shuffle ?? 'off');
  const [more, setMore] = useState(false);
  const [group, setGroup] = useState<Group>('popular');
  const [about, setAbout] = useState(false);

  if (isLoading) return <div className={page.centered}><Spinner /></div>;
  if (!data) {
    return (
      <div className={page.empty}>
        <h2>{t('notFound.title')}</h2>
        <Link to="/"><Button variant="white">{t('notFound.home')}</Button></Link>
      </div>
    );
  }
  const { artist, topTracks, releases, related, featuring } = data;
  const uri = `melodify:artist:${artist.id}`;
  const following = saved.data?.has(`artist:${artist.id}`) ?? artist.isFollowing;
  const groups = (['popular', 'albums', 'singles', 'compilations'] as Group[]).filter((g) => releases[g].length > 0);
  const discography: Card[] = releases[group] ?? [];
  const likedCount = topTracks.filter((tr) => liked.data?.has(tr.id)).length;

  const follow = () => toggleSaved.mutate({ type: 'artist', id: artist.id, saved: !following });

  return (
    <div className={page.page}>
      <StickyBar color={artist.dominantColor} threshold={300}>
        <PlayButton context={{ type: 'artist', id: artist.id }} uri={uri} name={artist.name} />
        <span className={entity.stickyTitle}>{artist.name}</span>
      </StickyBar>
      <EntityHeader
        color={artist.dominantColor}
        banner={artist.bannerUrl ?? artist.avatarUrl}
        cover={null}
        label={
          artist.verified ? (
            <>
              <Icon name="verified" size={24} />
              {t('entity.verifiedArtist')}
            </>
          ) : artist.isCreator ? (
            t('artist.creator', { app: BRAND.name })
          ) : null
        }
        title={artist.name}
        meta={<span className={styles.listeners}>{t('entity.monthlyListeners', { formatted: formatNumber(artist.monthlyListeners, lang) })}</span>}
      />
      <EntityBody color={artist.dominantColor}>
        <ActionBar>
          <PlayButton context={{ type: 'artist', id: artist.id }} uri={uri} name={artist.name} size="large" promptImage={artist.avatarUrl} promptColor={artist.dominantColor} />
          {me && (
            <Tooltip label={shuffle === 'off' ? t('actions.shuffle', { name: artist.name }) : t('actions.unshuffle', { name: artist.name })}>
              <button type="button" className={`${entity.bigIcon} ${shuffle !== 'off' ? entity.on : ''}`} onClick={() => void cycleShuffle(Boolean(me.entitlements.smartShuffle))}>
                <Icon name={shuffle === 'smart' ? 'smartShuffle' : 'shuffle'} size={32} />
              </button>
            </Tooltip>
          )}
          <Button variant="outline" size="sm" onClick={me ? follow : () => toast(t('loggedOut.libraryBody'))}>
            {following ? t('actions.following') : t('actions.follow')}
          </Button>
          <DropdownMenu
            entries={[
              ...(me ? [{ label: following ? t('menu.unfollow') : t('menu.follow'), icon: 'user' as const, onSelect: follow }] : []),
              ...(me ? [{ label: t('menu.artistRadio'), icon: 'radio' as const, onSelect: () => radio.mutate({ type: 'artist', id: artist.id }) }] : []),
              { kind: 'separator' as const },
              { label: t('menu.copyLink'), icon: 'link' as const, onSelect: () => void navigator.clipboard.writeText(location.href).then(() => toast(t('actions.linkCopied'))) },
            ]}
            trigger={
              <button type="button" className={entity.bigIcon} aria-label={t('actions.moreOptions', { name: artist.name })}>
                <Icon name="more" size={32} />
              </button>
            }
          />
        </ActionBar>

        <div className={styles.topArea}>
          <section className={styles.popular}>
            <h2 className={styles.h2}>{t('artist.popular')}</h2>
            <TrackList
              tracks={more ? topTracks : topTracks.slice(0, 5)}
              context={{ type: 'artist', id: artist.id, uri }}
              columns={{ cover: true, plays: true }}
              showHeader={false}
            />
            {topTracks.length > 5 && (
              <button type="button" className={styles.seeMore} onClick={() => setMore(!more)}>
                {more ? t('actions.showLess') : t('actions.seeMore')}
              </button>
            )}
          </section>
          {likedCount > 0 && me && (
            <aside className={styles.pick}>
              <h2 className={styles.h2}>{lang === 'vi' ? 'Bài hát đã thích' : 'Liked Songs'}</h2>
              <Link to="/collection/tracks" className={styles.pickRow}>
                <span className={styles.pickAvatar} style={{ backgroundImage: artist.avatarUrl ? `url(${artist.avatarUrl})` : undefined }}>
                  <Icon name="heartFilled" size={14} />
                </span>
                <span>
                  <strong>{lang === 'vi' ? `Bạn đã thích ${likedCount} bài hát` : `You've liked ${likedCount} songs`}</strong>
                  <small>{lang === 'vi' ? `Của ${artist.name}` : `By ${artist.name}`}</small>
                </span>
              </Link>
            </aside>
          )}
        </div>

        {groups.length > 0 && (
          <section className={styles.discography}>
            <div className={styles.discHead}>
              <h2 className={styles.h2}>
                <Link to={`/artist/${artist.id}/discography/all`}>{t('artist.discography')}</Link>
              </h2>
              <Link to={`/artist/${artist.id}/discography/all`} className={styles.showAll}>
                {t('home.showAll')}
              </Link>
            </div>
            <div className={styles.chips}>
              {groups.map((g) => (
                <Chip key={g} selected={group === g} onClick={() => setGroup(g)}>
                  {g === 'popular' ? t('artist.popularReleases') : t(`artist.${g}`)}
                </Chip>
              ))}
            </div>
            <div className={page.sections} style={{ padding: 0 }}>
              <Shelf title="" items={discography} variant="discography" />
            </div>
          </section>
        )}

        <div className={page.sections} style={{ marginTop: 16 }}>
          <Shelf title={t('artist.featuring', { name: artist.name })} items={featuring} />
          <Shelf title={t('artist.fansAlsoLike')} seeAllPath={`/artist/${artist.id}/related`} items={related} />
        </div>

        {(artist.bio || artist.avatarUrl) && (
          <section className={styles.aboutWrap}>
            <h2 className={styles.h2}>{t('artist.about')}</h2>
            <button type="button" className={styles.about} onClick={() => setAbout(true)} style={{ backgroundImage: artist.avatarUrl ? `url(${artist.avatarUrl})` : undefined }}>
              <span className={styles.aboutShade} />
              <span className={styles.aboutText}>
                <strong>{t('entity.monthlyListeners', { formatted: formatNumber(artist.monthlyListeners, lang) })}</strong>
                {artist.bio && <span className={clsx(styles.aboutBio, 'clamp-2')}>{artist.bio}</span>}
              </span>
            </button>
          </section>
        )}
      </EntityBody>
      <PageFooter />

      <Dialog open={about} onOpenChange={setAbout} title={artist.name} className={styles.aboutDialog}>
        <div className={styles.aboutStats}>
          <div>
            <strong>{formatNumber(artist.followersCount, lang)}</strong>
            <span>{lang === 'vi' ? 'Người theo dõi' : 'Followers'}</span>
          </div>
          <div>
            <strong>{formatNumber(artist.monthlyListeners, lang)}</strong>
            <span>{lang === 'vi' ? 'Người nghe hằng tháng' : 'Monthly Listeners'}</span>
          </div>
        </div>
        {artist.bio && <p className={styles.aboutFull}>{artist.bio}</p>}
        {artist.externalUrl && (
          <a href={artist.externalUrl} target="_blank" rel="noreferrer" className={styles.source}>
            <Icon name="external" /> {t('artist.source')}
          </a>
        )}
      </Dialog>
    </div>
  );
}
