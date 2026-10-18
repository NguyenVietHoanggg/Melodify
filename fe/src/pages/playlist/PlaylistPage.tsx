import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import type { Playlist, Track } from '@contracts';
import { useAddToPlaylist, useDeletePlaylist, useToggleSaved, useUpdatePlaylist } from '@/api/mutations';
import { useMe, usePlaylist, usePlaylistRecommendations, usePlaylistTracks, useSavedIds, useSearch } from '@/api/queries';
import { ActionBar, EntityBody, EntityHeader, MetaDot } from '@/components/entity/EntityHeader';
import { StickyBar } from '@/components/entity/StickyBar';
import entity from '@/components/entity/entity.module.css';
import { Icon } from '@/components/icons/Icon';
import { PageFooter } from '@/components/layout/PageFooter';
import { Cover } from '@/components/media/Cover';
import { PlayButton } from '@/components/media/PlayButton';
import { TrackList, type ListTrack } from '@/components/tracks/TrackList';
import { Button, IconButton } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Dialog';
import { DropdownMenu, type MenuEntry } from '@/components/ui/Menu';
import { Tooltip } from '@/components/ui/Tooltip';
import { errorMessage, post, put } from '@/lib/api';
import { formatNumber, formatTotalDuration } from '@/lib/format';
import { cycleShuffle } from '@/player/commands';
import { usePlayer } from '@/player/store';
import { useDialogs } from '@/stores/dialogs';
import { toast } from '@/stores/toast';
import { useUi } from '@/stores/ui';
import { AiRefinePanel } from '../ai/AiRefinePanel';
import { EditPlaylistDialog } from './EditPlaylistDialog';
import { MixEditorDialog, type MixPair } from './MixEditorDialog';
import page from '../page.module.css';
import styles from './playlist.module.css';

function label(p: Playlist, t: (k: string) => string) {
  if (p.isCollaborative) return t('entity.collaborativePlaylist');
  if (p.kind === 'user' && !p.isPublic) return t('entity.privatePlaylist');
  return p.kind === 'user' || p.kind === 'editorial' ? t('entity.publicPlaylist') : t('entity.playlist');
}

function FindMore({ playlist }: { playlist: Playlist }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const { data, isFetching } = useSearch(q, 'tracks');
  const add = useAddToPlaylist();
  const results = (data?.tracks.items ?? []).slice(0, 10).map((tr) => ({ ...tr, isRecommendation: true }) as ListTrack);
  return (
    <section className={entity.findMore}>
      <h2>{t('tracklist.findSomething')}</h2>
      <div className={entity.findInput}>
        <Icon name="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('tracklist.searchSongs')} />
        {isFetching && <Spinner size={16} />}
        {q && <IconButton icon="close" label={t('nav.clearSearch')} onClick={() => setQ('')} tooltip={false} />}
      </div>
      {q && (
        <TrackList
          tracks={results}
          context={{ type: 'track', id: results[0]?.id ?? null, uri: 'melodify:search' }}
          columns={{ cover: true, album: true }}
          showHeader={false}
          offsetBy="trackId"
          onAddRecommendation={(tr) => add.mutate({ playlistId: playlist.id, trackIds: [tr.id], name: playlist.name })}
        />
      )}
    </section>
  );
}

function Recommended({ playlist }: { playlist: Playlist }) {
  const { t } = useTranslation();
  const [refresh, setRefresh] = useState(0);
  const { data } = usePlaylistRecommendations(playlist.id, refresh, true);
  const add = useAddToPlaylist();
  const recs = (data?.items ?? []).map((tr) => ({ ...tr, isRecommendation: true }) as ListTrack);
  if (!recs.length) return null;
  return (
    <section className={entity.below}>
      <div className={entity.belowHead}>
        <div>
          <h2>{t('tracklist.recommended')}</h2>
          <p>{t('tracklist.recommendedBody')}</p>
        </div>
      </div>
      <TrackList
        tracks={recs}
        context={{ type: 'track', id: recs[0]?.id ?? null, uri: `melodify:recs:${playlist.id}` }}
        columns={{ cover: true, album: true }}
        showHeader={false}
        offsetBy="trackId"
        onAddRecommendation={(tr) => add.mutate({ playlistId: playlist.id, trackIds: [tr.id], name: playlist.name })}
      />
      <div className={styles.refreshRow}>
        <button type="button" className={styles.refresh} onClick={() => setRefresh((n) => n + 1)}>
          {t('tracklist.refresh')}
        </button>
      </div>
    </section>
  );
}

export function PlaylistPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const me = useMe();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data: playlist, isLoading, error } = usePlaylist(id);
  const tracksQuery = usePlaylistTracks(id);
  const saved = useSavedIds(Boolean(me));
  const toggleSaved = useToggleSaved();
  const update = useUpdatePlaylist();
  const del = useDeletePlaylist();
  const add = useAddToPlaylist();
  const density = useUi((s) => s.trackListDensity);
  const setDensity = useUi((s) => s.setTrackListDensity);
  const [editing, setEditing] = useState(params.get('edit') === '1');
  const [mixPair, setMixPair] = useState<MixPair | null>(null);
  const view = usePlayer((s) => s.view);

  const tracks: ListTrack[] = useMemo(() => tracksQuery.data?.pages.flatMap((p) => p.items) ?? [], [tracksQuery.data]);

  // Smart Shuffle: show the backend's recommendations right inside the list, every 3 songs (like Spotify).
  const uri = `melodify:playlist:${id}`;
  const smartRecs: Track[] = view?.context?.uri === uri && view.shuffle === 'smart' ? view.upcoming.filter((q) => q.source === 'smart_shuffle' && q.track).map((q) => q.track!) : [];
  const displayed: ListTrack[] = useMemo(() => {
    if (!smartRecs.length) return tracks;
    const out: ListTrack[] = [];
    let r = 0;
    tracks.forEach((tr, i) => {
      out.push(tr);
      if ((i + 1) % 3 === 0 && smartRecs[r]) out.push({ ...smartRecs[r++]!, isRecommendation: true });
    });
    return out;
  }, [tracks, smartRecs.map((s) => s.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <div className={page.centered}><Spinner /></div>;
  if (error || !playlist) {
    return (
      <div className={page.empty}>
        <h2>{t('notFound.title')}</h2>
        <Link to="/"><Button variant="white">{t('notFound.home')}</Button></Link>
      </div>
    );
  }

  const isSaved = saved.data?.has(`playlist:${playlist.id}`) ?? playlist.isSaved;
  const canEdit = playlist.permissions.canEdit;
  const isOwner = playlist.permissions.canDelete;
  const editorial = playlist.kind !== 'user' && playlist.kind !== 'ai';
  const shuffle = view?.context?.uri === uri ? view.shuffle : view?.shuffle ?? 'off';
  const color = playlist.dominantColor ?? playlist.mixCover?.color ?? '#535353';
  const cover = <Cover imageUrl={playlist.coverUrl} mosaic={playlist.mosaic} mixCover={playlist.mixCover} radius="lg" eager />;
  const mixAllowed = Boolean(me?.entitlements.mix);

  const toggleMix = async () => {
    if (!mixAllowed) return toast(t('player.premiumOnly'), { action: { label: t('nav.explorePremium'), onClick: () => (location.href = '/premium') } });
    try {
      await put(`/playlists/${playlist.id}/mix`, { enabled: !playlist.mixEnabled });
      void qc.invalidateQueries({ queryKey: ['playlist', playlist.id] });
      void qc.invalidateQueries({ queryKey: ['playlist-tracks', playlist.id] });
    } catch (err) {
      toast(errorMessage(err));
    }
  };
  const smartReorder = async () => {
    try {
      await post(`/playlists/${playlist.id}/smart-reorder`, { keepFirst: true });
      toast(lang === 'vi' ? 'Đã sắp xếp lại để chuyển bài mượt nhất' : 'Reordered for the smoothest flow');
      void qc.invalidateQueries({ queryKey: ['playlist-tracks', playlist.id] });
    } catch (err) {
      toast(errorMessage(err));
    }
  };

  const menu: MenuEntry[] = [
    ...(isOwner
      ? ([
          { label: t('menu.editDetails'), icon: 'edit', onSelect: () => setEditing(true) },
          { label: playlist.isPublic ? t('menu.makePrivate') : t('menu.makePublic'), icon: playlist.isPublic ? 'lock' : 'globe', onSelect: () => update.mutate({ id: playlist.id, isPublic: !playlist.isPublic }) },
          {
            label: t('menu.inviteCollaborators'), icon: 'friends',
            onSelect: async () => {
              const { url } = await post<{ url: string }>(`/playlists/${playlist.id}/invite`);
              await navigator.clipboard.writeText(url);
              toast(t('actions.linkCopied'));
            },
          },
          ...(playlist.mixEnabled ? [{ label: lang === 'vi' ? 'Sắp xếp thông minh (Smart Reorder)' : 'Smart Reorder', icon: 'mix', onSelect: () => void smartReorder() } as MenuEntry] : []),
          { kind: 'separator' },
          {
            label: t('menu.delete'), icon: 'trash', danger: true,
            onSelect: () => setTimeout(() => useDialogs.getState().openConfirm({
              title: t('menu.deletePlaylistTitle'),
              body: t('menu.deletePlaylistBody', { name: playlist.name }),
              confirmLabel: t('menu.delete'),
              danger: true,
              onConfirm: () => del.mutate(playlist.id),
            }), 0),
          },
        ] as MenuEntry[])
      : me
        ? ([{ label: isSaved ? t('menu.removeFromLibrary') : t('menu.addToLibrary'), icon: isSaved ? 'checkCircle' : 'addCircle', onSelect: () => toggleSaved.mutate({ type: 'playlist', id: playlist.id, saved: !isSaved }) }] as MenuEntry[])
        : []),
    { kind: 'separator' },
    { label: t('menu.copyLink'), icon: 'link', onSelect: () => void navigator.clipboard.writeText(location.href).then(() => toast(t('actions.linkCopied'))) },
  ];

  const meta = (
    <>
      {playlist.owner?.avatarUrl && <img className={entity.avatar} src={playlist.owner.avatarUrl} alt="" />}
      {playlist.owner ? (
        <Link to={`/user/${playlist.owner.id}`}><strong>{playlist.ownerName}</strong></Link>
      ) : (
        <strong>{playlist.ownerName}</strong>
      )}
      {playlist.kind === 'mix' && me && <><MetaDot />{t('entity.mixCreatedFor', { name: me.displayName })}</>}
      {playlist.followersCount > 0 && <><MetaDot />{t('entity.saves', { count: playlist.followersCount, formatted: formatNumber(playlist.followersCount, lang) })}</>}
      {playlist.totalTracks > 0 && (
        <>
          <MetaDot />
          {t('entity.songs', { count: playlist.totalTracks, formatted: formatNumber(playlist.totalTracks, lang) })}, {formatTotalDuration(playlist.durationMs, lang)}
        </>
      )}
    </>
  );

  return (
    <div className={page.page} data-testid="playlist-page">
      <StickyBar color={color}>
        <PlayButton context={{ type: 'playlist', id: playlist.id }} uri={uri} name={playlist.name} />
        <span className={entity.stickyTitle}>{playlist.name}</span>
      </StickyBar>
      <EntityHeader
        color={color}
        cover={cover}
        label={label(playlist, t)}
        title={playlist.name}
        description={playlist.description}
        meta={meta}
        onTitleClick={isOwner ? () => setEditing(true) : undefined}
      />
      <EntityBody color={color}>
        <ActionBar
          right={
            <button
              type="button"
              className={entity.viewToggle}
              aria-label={density === 'list' ? t('actions.list') : t('actions.compact')}
              onClick={() => setDensity(density === 'list' ? 'compact' : 'list')}
            >
              <span className={entity.viewToggleLabel}>{density === 'list' ? t('actions.list') : t('actions.compact')}</span>
              <Icon name={density === 'list' ? 'listView' : 'compactView'} />
            </button>
          }
        >
          {tracks.length > 0 && <PlayButton context={{ type: 'playlist', id: playlist.id }} uri={uri} name={playlist.name} size="large" promptImage={playlist.coverUrl ?? playlist.mosaic[0]} promptColor={color} />}
          {tracks.length > 0 && me && (
            <Tooltip label={shuffle === 'off' ? t('actions.shuffle', { name: playlist.name }) : t('actions.unshuffle', { name: playlist.name })}>
              <button type="button" className={`${entity.bigIcon} ${shuffle !== 'off' ? entity.on : ''}`} onClick={() => void cycleShuffle(Boolean(me.entitlements.smartShuffle))}>
                <Icon name={shuffle === 'smart' ? 'smartShuffle' : 'shuffle'} size={32} />
              </button>
            </Tooltip>
          )}
          {me && !isOwner && (
            <Tooltip label={isSaved ? t('actions.removeFromLibrary') : t('actions.saveToLibrary')}>
              <button type="button" className={`${entity.bigIcon} ${isSaved ? entity.on : ''}`} onClick={() => toggleSaved.mutate({ type: 'playlist', id: playlist.id, saved: !isSaved })}>
                <Icon name={isSaved ? 'checkCircle' : 'addCircle'} size={32} />
              </button>
            </Tooltip>
          )}
          {playlist.permissions.canMix && (
            <Tooltip label={lang === 'vi' ? 'Mix: chuyển bài kiểu DJ (Premium)' : 'Mix: DJ-style transitions (Premium)'}>
              <button type="button" className={`${styles.mixButton} ${playlist.mixEnabled ? styles.mixOn : ''}`} onClick={() => void toggleMix()} aria-pressed={playlist.mixEnabled}>
                <Icon name="mix" />
                Mix
              </button>
            </Tooltip>
          )}
          <DropdownMenu
            entries={menu}
            trigger={
              <button type="button" className={entity.bigIcon} aria-label={t('actions.moreOptions', { name: playlist.name })}>
                <Icon name="more" size={32} />
              </button>
            }
          />
        </ActionBar>
        {playlist.ai && <AiRefinePanel playlistId={playlist.id} ai={playlist.ai} />}
        <div className={entity.listArea}>
          <TrackList
            tracks={displayed}
            context={{ type: 'playlist', id: playlist.id, uri }}
            columns={{ cover: density === 'list', album: true, dateAdded: !editorial, plays: editorial, bpmKey: playlist.mixEnabled }}
            compact={density === 'compact'}
            playlistId={playlist.id}
            canEdit={canEdit}
            onAddRecommendation={canEdit ? (tr) => add.mutate({ playlistId: playlist.id, trackIds: [tr.id], name: playlist.name }) : undefined}
            onTransitionClick={playlist.mixEnabled && isOwner ? (a, b) => setMixPair({ from: a, to: b }) : undefined}
            empty={canEdit ? null : <p className={page.empty}>{t('tracklist.emptyPlaylist')}</p>}
          />
          {tracksQuery.hasNextPage && (
            <div className={styles.loadMore}>
              <Button variant="outline" size="sm" onClick={() => void tracksQuery.fetchNextPage()} disabled={tracksQuery.isFetchingNextPage}>
                {t('library.showMore')}
              </Button>
            </div>
          )}
        </div>
        {canEdit && tracks.length > 0 && <Recommended playlist={playlist} />}
        {canEdit && <FindMore playlist={playlist} />}
      </EntityBody>
      <PageFooter />
      {editing && <EditPlaylistDialog playlist={playlist} open={editing} onOpenChange={(o) => { setEditing(o); if (!o) setParams({}); }} />}
      {mixPair && <MixEditorDialog playlistId={playlist.id} pair={mixPair} onClose={() => setMixPair(null)} />}
    </div>
  );
}
