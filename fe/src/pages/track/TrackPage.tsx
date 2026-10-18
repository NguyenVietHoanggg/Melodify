import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useToggleLike } from '@/api/mutations';
import { useArtistPage, useLikedIds, useMe, useTrack } from '@/api/queries';
import { ActionBar, EntityBody, EntityHeader, MetaDot } from '@/components/entity/EntityHeader';
import { StickyBar } from '@/components/entity/StickyBar';
import entity from '@/components/entity/entity.module.css';
import { Icon } from '@/components/icons/Icon';
import { PageFooter } from '@/components/layout/PageFooter';
import { Cover } from '@/components/media/Cover';
import { PlayButton } from '@/components/media/PlayButton';
import { Shelf } from '@/components/media/Shelf';
import { TrackList } from '@/components/tracks/TrackList';
import { useTrackMenu } from '@/components/tracks/useTrackMenu';
import { Spinner } from '@/components/ui/Dialog';
import { DropdownMenu } from '@/components/ui/Menu';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatDuration, formatNumber } from '@/lib/format';
import { LyricsBlock } from '../lyrics/LyricsPage';
import page from '../page.module.css';

/** open.spotify.com/track/:id — one song, its lyrics and more from the artist. */
export function TrackPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const me = useMe();
  const { data: track, isLoading } = useTrack(id);
  const artistId = track?.artists[0]?.id ?? '';
  const artist = useArtistPage(artistId);
  const liked = useLikedIds(Boolean(me));
  const toggleLike = useToggleLike();
  const menu = useTrackMenu();
  if (isLoading || !track) return <div className={page.centered}><Spinner /></div>;
  const isLiked = liked.data?.has(track.id) ?? false;
  const uri = `melodify:track:${track.id}`;
  const color = artist.data?.artist.dominantColor ?? '#535353';
  return (
    <div className={page.page}>
      <StickyBar color={color}>
        <PlayButton context={{ type: 'track', id: track.id }} uri={uri} name={track.title} />
        <span className={entity.stickyTitle}>{track.title}</span>
      </StickyBar>
      <EntityHeader
        color={color}
        cover={<Cover imageUrl={track.album?.coverUrl} radius="lg" eager />}
        label={t('card.song')}
        title={track.title}
        meta={
          <>
            {track.artists.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ', '}
                <Link to={`/artist/${a.id}`}><strong>{a.name}</strong></Link>
              </span>
            ))}
            {track.album && <><MetaDot /><Link to={`/album/${track.album.id}`}>{track.album.title}</Link></>}
            {track.releaseDate && <><MetaDot />{track.releaseDate.slice(0, 4)}</>}
            <MetaDot />
            {formatDuration(track.durationMs)}
            <MetaDot />
            {formatNumber(track.playCount, lang)}
          </>
        }
      />
      <EntityBody color={color}>
        <ActionBar>
          <PlayButton context={{ type: 'track', id: track.id }} uri={uri} name={track.title} size="large" promptImage={track.album?.coverUrl} promptColor={color} />
          {me && (
            <Tooltip label={isLiked ? t('player.removeFromLiked') : t('player.addToLiked')}>
              <button type="button" className={`${entity.bigIcon} ${isLiked ? entity.on : ''}`} onClick={() => toggleLike.mutate({ ids: [track.id], liked: !isLiked })}>
                <Icon name={isLiked ? 'checkCircle' : 'addCircle'} size={32} />
              </button>
            </Tooltip>
          )}
          <DropdownMenu
            entries={menu(track)}
            trigger={
              <button type="button" className={entity.bigIcon} aria-label={t('actions.moreOptions', { name: track.title })}>
                <Icon name="more" size={32} />
              </button>
            }
          />
        </ActionBar>
        <div className={entity.listArea}>
          <LyricsBlock trackId={track.id} compact />
        </div>
        {artist.data && (
          <>
            <div className={entity.below}>
              <div className={entity.belowHead}>
                <div>
                  <p>{t('artist.popular')}</p>
                  <h2>{artist.data.artist.name}</h2>
                </div>
              </div>
              <TrackList tracks={artist.data.topTracks.slice(0, 5)} context={{ type: 'artist', id: artistId, uri: `melodify:artist:${artistId}` }} columns={{ cover: true, plays: true }} showHeader={false} />
            </div>
            <div className={page.sections} style={{ marginTop: 24 }}>
              <Shelf title={t('artist.popularReleases')} seeAllPath={`/artist/${artistId}/discography/all`} items={artist.data.releases.popular} variant="discography" />
            </div>
          </>
        )}
      </EntityBody>
      <PageFooter />
    </div>
  );
}
