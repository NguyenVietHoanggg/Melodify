/**
 * "About the artist" in the Now Playing view: a compact card (image, name, listeners, Follow, 3 lines of
 * bio) that opens a dialog with everything — like Spotify, where the card expands into an artist bio.
 */
import { useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import type { Artist } from '@contracts';
import { useToggleSaved } from '@/api/mutations';
import { useArtistPage, useMe, useSavedIds } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { Linkified } from '@/components/text/Linkified';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { formatNumber } from '@/lib/format';
import styles from './right.module.css';

function FollowButton({ artist }: { artist: Artist }) {
  const { t } = useTranslation();
  const me = useMe();
  const saved = useSavedIds(Boolean(me));
  const toggle = useToggleSaved();
  if (!me || artist.isCreator) return null;
  const following = saved.data?.has(`artist:${artist.id}`) ?? artist.isFollowing;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        toggle.mutate({ type: 'artist', id: artist.id, saved: !following });
      }}
    >
      {following ? t('actions.following') : t('actions.follow')}
    </Button>
  );
}

function AboutDialog({ artist, open, onOpenChange }: { artist: Artist; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const navigate = useNavigate();
  const image = artist.bannerUrl ?? artist.avatarUrl;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} className={styles.aboutDialog} closeLabel={t('loggedOut.close')}>
      <div className={styles.aboutHero} style={{ backgroundImage: image ? `url(${image})` : undefined, ['--artist-color' as string]: artist.dominantColor ?? '#535353' }}>
        <div className={styles.aboutHeroText}>
          {artist.verified && (
            <span className={styles.verified}>
              <Icon name="verified" size={20} /> {t('entity.verifiedArtist')}
            </span>
          )}
          <h2>{artist.name}</h2>
        </div>
      </div>
      <div className={styles.aboutContent}>
        <div className={styles.aboutStats}>
          <div>
            <strong>{formatNumber(artist.monthlyListeners, lang)}</strong>
            <span>{t('npv.listenersLabel')}</span>
          </div>
          <div>
            <strong>{formatNumber(artist.followersCount, lang)}</strong>
            <span>{t('npv.followersLabel')}</span>
          </div>
        </div>
        {artist.genres.length > 0 && (
          <ul className={styles.aboutGenres}>
            {artist.genres.map((g) => (
              <li key={g}>{t(`genres.${g}`, { defaultValue: g })}</li>
            ))}
          </ul>
        )}
        {artist.bio ? <Linkified text={artist.bio} className={styles.aboutBio} /> : null}
        <div className={styles.aboutActions}>
          <Button
            variant="white"
            onClick={() => {
              onOpenChange(false);
              navigate(`/artist/${artist.id}`);
            }}
          >
            {t('npv.openArtist')}
          </Button>
          <FollowButton artist={artist} />
          {artist.externalUrl && (
            <a href={artist.externalUrl} target="_blank" rel="noopener noreferrer" className={styles.aboutExternal}>
              {t('artist.source')} <Icon name="external" size={12} />
            </a>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export function AboutArtist({ artistId }: { artistId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const { data } = useArtistPage(artistId);
  const [open, setOpen] = useState(false);
  if (!data) return <div className={clsx(styles.card, styles.aboutSkeleton)} aria-hidden />;
  const a = data.artist;
  const image = a.bannerUrl ?? a.avatarUrl;
  return (
    <>
      <section
        className={clsx(styles.card, styles.aboutCard)}
        role="button"
        tabIndex={0}
        aria-label={`${t('npv.aboutArtist')}: ${a.name}`}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(true))}
      >
        <div className={styles.aboutImage} style={{ backgroundImage: image ? `url(${image})` : undefined }}>
          <span className={styles.aboutLabel}>{t('npv.aboutArtist')}</span>
        </div>
        <div className={styles.cardBody}>
          <Link to={`/artist/${a.id}`} className={styles.aboutName} onClick={(e) => e.stopPropagation()}>
            {a.name}
            {a.verified && <Icon name="verified" size={14} className={styles.verifiedSmall} />}
          </Link>
          <div className={styles.aboutRow}>
            <span className={styles.muted}>{t('entity.monthlyListeners', { formatted: formatNumber(a.monthlyListeners, lang) })}</span>
            <FollowButton artist={a} />
          </div>
          {a.bio && <p className={clsx(styles.muted, styles.bio)}>{a.bio}</p>}
        </div>
      </section>
      <AboutDialog artist={a} open={open} onOpenChange={setOpen} />
    </>
  );
}
