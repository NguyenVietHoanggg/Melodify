import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useToggleSaved } from '@/api/mutations';
import { useAlbumPage, useMe, useSavedIds } from '@/api/queries';
import { ActionBar, EntityBody, EntityHeader, MetaDot } from '@/components/entity/EntityHeader';
import { StickyBar } from '@/components/entity/StickyBar';
import entity from '@/components/entity/entity.module.css';
import { Icon } from '@/components/icons/Icon';
import { PageFooter } from '@/components/layout/PageFooter';
import { Cover } from '@/components/media/Cover';
import { PlayButton } from '@/components/media/PlayButton';
import { Shelf } from '@/components/media/Shelf';
import { TrackList } from '@/components/tracks/TrackList';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Dialog';
import { DropdownMenu } from '@/components/ui/Menu';
import { Tooltip } from '@/components/ui/Tooltip';
import { useRadio } from '@/api/mutations';
import { formatDate, formatNumber, formatTotalDuration } from '@/lib/format';
import { cycleShuffle } from '@/player/commands';
import { usePlayer } from '@/player/store';
import { toast } from '@/stores/toast';
import page from '../page.module.css';

export function AlbumPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const me = useMe();
  const { data, isLoading } = useAlbumPage(id);
  const saved = useSavedIds(Boolean(me));
  const toggleSaved = useToggleSaved();
  const radio = useRadio();
  const shuffle = usePlayer((s) => s.view?.shuffle ?? 'off');

  if (isLoading) return <div className={page.centered}><Spinner /></div>;
  if (!data) {
    return (
      <div className={page.empty}>
        <h2>{t('notFound.title')}</h2>
        <Link to="/"><Button variant="white">{t('notFound.home')}</Button></Link>
      </div>
    );
  }
  const { album, moreBy } = data;
  const uri = `melodify:album:${album.id}`;
  const isSaved = saved.data?.has(`album:${album.id}`) ?? album.isSaved;
  const kind = album.releaseType === 'single' ? t('card.single') : album.releaseType === 'ep' ? t('card.ep') : album.releaseType === 'compilation' ? t('card.compilation') : t('card.album');
  const year = album.releaseDate?.slice(0, 4);
  const first = album.artists[0];

  return (
    <div className={page.page}>
      <StickyBar color={album.dominantColor}>
        <PlayButton context={{ type: 'album', id: album.id }} uri={uri} name={album.title} />
        <span className={entity.stickyTitle}>{album.title}</span>
      </StickyBar>
      <EntityHeader
        color={album.dominantColor}
        cover={<Cover imageUrl={album.coverUrl} radius="lg" eager />}
        label={kind}
        title={album.title}
        meta={
          <>
            {album.artists.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ', '}
                <Link to={`/artist/${a.id}`}><strong>{a.name}</strong></Link>
              </span>
            ))}
            {year && <><MetaDot />{year}</>}
            <MetaDot />
            {t('entity.songs', { count: album.totalTracks, formatted: formatNumber(album.totalTracks, lang) })}, {formatTotalDuration(album.durationMs, lang)}
          </>
        }
      />
      <EntityBody color={album.dominantColor}>
        <ActionBar>
          <PlayButton context={{ type: 'album', id: album.id }} uri={uri} name={album.title} size="large" promptImage={album.coverUrl} promptColor={album.dominantColor} />
          {me && (
            <>
              <Tooltip label={shuffle === 'off' ? t('actions.shuffle', { name: album.title }) : t('actions.unshuffle', { name: album.title })}>
                <button type="button" className={`${entity.bigIcon} ${shuffle !== 'off' ? entity.on : ''}`} onClick={() => void cycleShuffle(Boolean(me.entitlements.smartShuffle))}>
                  <Icon name={shuffle === 'smart' ? 'smartShuffle' : 'shuffle'} size={32} />
                </button>
              </Tooltip>
              <Tooltip label={isSaved ? t('actions.removeFromLibrary') : t('actions.saveToLibrary')}>
                <button type="button" className={`${entity.bigIcon} ${isSaved ? entity.on : ''}`} onClick={() => toggleSaved.mutate({ type: 'album', id: album.id, saved: !isSaved })}>
                  <Icon name={isSaved ? 'checkCircle' : 'addCircle'} size={32} />
                </button>
              </Tooltip>
            </>
          )}
          <DropdownMenu
            entries={[
              ...(me ? [{ label: isSaved ? t('menu.removeFromLibrary') : t('menu.addToLibrary'), icon: 'addCircle' as const, onSelect: () => toggleSaved.mutate({ type: 'album', id: album.id, saved: !isSaved }) }] : []),
              ...(me && first ? [{ label: t('menu.artistRadio'), icon: 'radio' as const, onSelect: () => radio.mutate({ type: 'artist', id: first.id }) }] : []),
              { kind: 'separator' as const },
              { label: t('menu.copyLink'), icon: 'link' as const, onSelect: () => void navigator.clipboard.writeText(location.href).then(() => toast(t('actions.linkCopied'))) },
            ]}
            trigger={
              <button type="button" className={entity.bigIcon} aria-label={t('actions.moreOptions', { name: album.title })}>
                <Icon name="more" size={32} />
              </button>
            }
          />
        </ActionBar>
        <div className={entity.listArea}>
          <TrackList tracks={album.tracks} context={{ type: 'album', id: album.id, uri }} columns={{}} />
        </div>
        <div className={entity.copyright}>
          {album.releaseDate && <strong>{formatDate(album.releaseDate, lang)}</strong>}
          {album.copyright && <div>{album.copyright}</div>}
          {album.label && <div>℗ {album.label}</div>}
        </div>
        {first && moreBy.length > 0 && (
          <div className={page.sections} style={{ marginTop: 32 }}>
            <Shelf title={t('album.moreBy', { name: first.name })} seeAllPath={`/artist/${first.id}/discography/all`} items={moreBy} variant="discography" />
          </div>
        )}
      </EntityBody>
      <PageFooter />
    </div>
  );
}
