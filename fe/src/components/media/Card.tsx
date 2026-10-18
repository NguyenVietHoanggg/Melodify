import { Fragment } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import type { ArtistRef, Card as CardData, CollectionId } from '@contracts';
import { useRecentSearch } from '@/api/mutations';
import { useMe } from '@/api/queries';
import { formatDuration } from '@/lib/format';
import { contextOf, hrefOf, yearOf } from '@/lib/links';
import { Cover } from './Cover';
import { Explicit, PlayButton } from './PlayButton';
import styles from './media.module.css';

export function ArtistLinks({ artists, className }: { artists: ArtistRef[]; className?: string }) {
  return (
    <span className={className}>
      {artists.map((a, i) => (
        <Fragment key={a.id}>
          {i > 0 && ', '}
          <Link to={`/artist/${a.id}`} onClick={(e) => e.stopPropagation()}>
            {a.name}
          </Link>
        </Fragment>
      ))}
    </span>
  );
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').trim();

/** Built-in collections have fixed ids: liked / episodes / uploads. */
export const collectionOf = (id: string): CollectionId => (id === 'episodes' || id === 'uploads' ? id : 'liked');
export const collectionTitle = (id: string, t: (k: string) => string) =>
  t(id === 'episodes' ? 'library.yourEpisodes' : id === 'uploads' ? 'library.yourUploads' : 'library.likedSongs');

/** The second line of a card, composed from data the same way Spotify writes it. */
export function CardSubtitle({ card, variant }: { card: CardData; variant?: 'default' | 'discography' }) {
  const { t, i18n } = useTranslation();
  // Profile pages show "12 Followers" under public playlists, like Spotify.
  if (card.followersCount !== undefined) {
    const lang = i18n.language === 'vi' ? 'vi-VN' : 'en-US';
    return <>{t('profile.followers', { count: card.followersCount, formatted: new Intl.NumberFormat(lang).format(card.followersCount) })}</>;
  }
  switch (card.type) {
    case 'playlist':
      return <>{card.description ? stripHtml(card.description) : t('card.by', { name: card.ownerName ?? '' })}</>;
    case 'album': {
      const kind = card.releaseType === 'single' ? t('card.single') : card.releaseType === 'ep' ? t('card.ep') : card.releaseType === 'compilation' ? t('card.compilation') : t('card.album');
      if (variant === 'discography') return <>{[yearOf(card.releaseDate), kind].filter(Boolean).join(' • ')}</>;
      return (
        <>
          {yearOf(card.releaseDate) && `${yearOf(card.releaseDate)} • `}
          <ArtistLinks artists={card.artists ?? []} />
        </>
      );
    }
    case 'artist':
      return <>{t('card.artist')}</>;
    case 'track':
      return (
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', maxWidth: '100%' }}>
          {card.explicit && <Explicit />}
          <ArtistLinks artists={card.artists ?? []} className="ellipsis" />
        </span>
      );
    case 'show':
      return <>{card.publisher ?? t('card.podcast')}</>;
    case 'episode': {
      const date = card.releaseDate ? new Intl.DateTimeFormat(i18n.language === 'vi' ? 'vi-VN' : 'en-US', { day: 'numeric', month: 'short' }).format(new Date(card.releaseDate)) : '';
      return <>{[date, card.durationMs ? formatDuration(card.durationMs) : ''].filter(Boolean).join(' • ')}</>;
    }
    case 'user':
      return <>{t('card.profile')}</>;
    default:
      return null;
  }
}

interface CardProps {
  card: CardData;
  variant?: 'default' | 'discography';
  /** Remember the click in "Recent searches". */
  fromSearch?: boolean;
}

export function Card({ card, variant, fromSearch }: CardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useMe();
  const recent = useRecentSearch();
  const round = card.type === 'artist' || card.type === 'user';
  const href = hrefOf(card.type, card.id);
  const ctx = contextOf(card);
  const title = card.type === 'collection' ? collectionTitle(card.id, t) : card.name;
  const remember = () => {
    if (fromSearch && me && card.type !== 'collection' && card.type !== 'category') recent.mutate({ type: card.type, id: card.id });
  };

  return (
    <div className={styles.card} onClick={() => { remember(); navigate(href); }} role="group" aria-label={title}>
      <div className={styles.cardImage}>
        <Cover
          imageUrl={card.imageUrl}
          mosaic={card.mosaic}
          mixCover={card.mixCover}
          collection={card.type === 'collection' ? collectionOf(card.id) : undefined}
          round={round}
          radius="md"
          fallbackIcon={card.type === 'artist' ? 'user' : card.type === 'show' || card.type === 'episode' ? 'podcast' : 'note'}
        />
        {ctx && (
          <PlayButton
            context={ctx}
            uri={card.uri}
            name={title}
            className={styles.cardPlay}
            promptImage={card.imageUrl}
            promptColor={card.color}
          />
        )}
      </div>
      <div className={clsx(styles.cardTitle, 'ellipsis')}>
        <Link to={href} onClick={(e) => { e.stopPropagation(); remember(); }} title={title}>
          {title}
        </Link>
      </div>
      <div className={clsx(styles.cardSubtitle, 'clamp-2')}>
        <CardSubtitle card={card} variant={variant} />
      </div>
    </div>
  );
}
