/** Builds the right-click / "…" menu of a track — one definition shared by every list in the app. */
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { Track } from '@contracts';
import {
  useAddToPlaylist, useCreatePlaylist, useRadio, useRemoveFromPlaylist, useToggleLike, useTrackFeedback,
} from '@/api/mutations';
import { useLibrary, useLikedIds, useMe } from '@/api/queries';
import type { MenuEntry } from '@/components/ui/Menu';
import { addToQueue } from '@/player/commands';
import { useDialogs } from '@/stores/dialogs';
import { toast } from '@/stores/toast';

export interface TrackMenuOptions {
  playlistId?: string;
  itemId?: string;
  canEdit?: boolean;
  /** Smart Shuffle / recommended rows get "Hide" and "Snooze" like Spotify. */
  isRecommendation?: boolean;
}

export function useTrackMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useMe();
  const liked = useLikedIds(Boolean(me));
  const toggleLike = useToggleLike();
  const library = useLibrary('playlists', 'alpha', '', Boolean(me));
  const addTo = useAddToPlaylist();
  const create = useCreatePlaylist();
  const remove = useRemoveFromPlaylist();
  const radio = useRadio();
  const feedback = useTrackFeedback();

  return (track: Track, opts: TrackMenuOptions = {}): MenuEntry[] => {
    const isLiked = liked.data?.has(track.id) ?? false;
    const ownPlaylists = (library.data?.items ?? []).filter((e) => e.type === 'playlist' && e.isOwn && e.id !== opts.playlistId);
    const link = `${location.origin}/track/${track.id}`;
    const signedIn = Boolean(me);
    return [
      ...(signedIn
        ? ([
            {
              kind: 'sub',
              label: t('menu.addToPlaylist'),
              icon: 'plus',
              filterPlaceholder: t('menu.findPlaylist'),
              entries: [
                { label: t('menu.newPlaylist'), icon: 'plus', onSelect: () => create.mutate({ name: track.title, trackIds: [track.id] }) },
                { kind: 'separator' },
                ...ownPlaylists.map((p) => ({ label: p.name, onSelect: () => addTo.mutate({ playlistId: p.id, trackIds: [track.id], name: p.name }) })),
              ],
            },
            {
              label: isLiked ? t('menu.removeFromLiked') : t('menu.addToLiked'),
              icon: isLiked ? 'checkCircle' : 'addCircle',
              onSelect: () => toggleLike.mutate({ ids: [track.id], liked: !isLiked }),
            },
            { label: t('menu.addToQueue'), icon: 'queue', onSelect: () => void addToQueue([{ kind: 'track', id: track.id }]) },
            ...(opts.canEdit && opts.playlistId && opts.itemId
              ? [{ label: t('menu.removeFromPlaylist'), icon: 'trash', onSelect: () => remove.mutate({ playlistId: opts.playlistId!, itemIds: [opts.itemId!] }) } as MenuEntry]
              : []),
            ...(opts.isRecommendation
              ? ([
                  { label: t('menu.hideSong'), icon: 'close', onSelect: () => feedback.mutate({ trackId: track.id, kind: 'hide' }, { onSuccess: () => toast(t('menu.hideSong')) }) },
                  { label: t('menu.snooze'), icon: 'clock', onSelect: () => feedback.mutate({ trackId: track.id, kind: 'snooze' }, { onSuccess: () => toast(t('menu.snooze')) }) },
                ] as MenuEntry[])
              : [
                  {
                    label: t('menu.excludeTaste'),
                    icon: 'close',
                    onSelect: () => feedback.mutate({ trackId: track.id, kind: 'exclude_taste' }, { onSuccess: () => toast(t('menu.excludeTaste')) }),
                  } as MenuEntry,
                ]),
            { kind: 'separator' },
            { label: t('menu.songRadio'), icon: 'radio', onSelect: () => radio.mutate({ type: 'track', id: track.id }) },
          ] as MenuEntry[])
        : []),
      track.artists.length > 1
        ? { kind: 'sub', label: t('menu.goToArtist'), icon: 'user', entries: track.artists.map((a) => ({ label: a.name, onSelect: () => navigate(`/artist/${a.id}`) })) }
        : { label: t('menu.goToArtist'), icon: 'user', onSelect: () => navigate(`/artist/${track.artists[0]?.id}`), disabled: !track.artists[0] },
      ...(track.album && track.origin !== 'upload' ? [{ label: t('menu.goToAlbum'), icon: 'note', onSelect: () => navigate(`/album/${track.album!.id}`) } as MenuEntry] : []),
      ...(track.origin === 'upload' && track.uploader
        ? ([
            { label: t('report.goToUploader'), icon: 'user', onSelect: () => navigate(`/user/${track.uploader!.id}`) },
            ...(me?.id === track.uploader.id
              ? [{ label: t('report.editUpload'), icon: 'edit', onSelect: () => navigate(`/uploads/${track.id}/edit`) }]
              : signedIn
                ? [{ label: t('report.menu'), icon: 'flag', onSelect: () => useDialogs.getState().openReport({ id: track.id, title: track.title }) }]
                : []),
          ] as MenuEntry[])
        : []),
      { label: t('menu.viewCredits'), icon: 'info', onSelect: () => useDialogs.getState().openCredits(track.id) },
      { kind: 'separator' },
      {
        kind: 'sub',
        label: t('menu.share'),
        icon: 'share',
        entries: [{ label: t('menu.copySongLink'), icon: 'link', onSelect: () => void navigator.clipboard.writeText(link).then(() => toast(t('actions.linkCopied'))) }],
      },
    ];
  };
}
