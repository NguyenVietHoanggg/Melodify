/**
 * Write actions with OPTIMISTIC updates: the UI changes instantly, the request runs in the background,
 * and if the backend says no we roll back and show the error. This is what makes Spotify feel instant.
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { AiPlaylistResult, Me, Playlist, Track, UserProfile, UserSettings } from '@contracts';
import i18n from '@/i18n';
import { del, errorMessage, patch, post, put } from '@/lib/api';
import { toast } from '@/stores/toast';
import { qk } from './queries';

const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts);

function updateSet(qc: QueryClient, key: readonly unknown[], fn: (s: Set<string>) => void) {
  const prev = qc.getQueryData<Set<string>>(key);
  const next = new Set(prev ?? []);
  fn(next);
  qc.setQueryData(key, next);
  return prev;
}

export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, liked }: { ids: string[]; liked: boolean }) => (liked ? put('/me/tracks', { ids }) : del('/me/tracks', { ids })),
    onMutate: ({ ids, liked }) => {
      const prev = updateSet(qc, qk.likedIds, (s) => ids.forEach((id) => (liked ? s.add(id) : s.delete(id))));
      toast(t(liked ? 'tracklist.addedToLiked' : 'tracklist.removedFromLiked'));
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.likedIds, ctx.prev);
      toast(errorMessage(err));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.likedTracks });
      void qc.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

export type SaveType = 'playlist' | 'album' | 'artist' | 'show';

export function useToggleSaved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, id, saved }: { type: SaveType; id: string; saved: boolean }) =>
      saved ? put('/me/library', { type, id }) : del('/me/library', { type, id }),
    onMutate: ({ type, id, saved }) => {
      const prev = updateSet(qc, qk.savedIds, (s) => (saved ? s.add(`${type}:${id}`) : s.delete(`${type}:${id}`)));
      if (type === 'album') toast(t(saved ? 'library.albumSaved' : 'library.albumRemoved'));
      else if (type !== 'artist') toast(t(saved ? 'menu.addToLibrary' : 'menu.removeFromLibrary'));
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.savedIds, ctx.prev);
      toast(errorMessage(err));
    },
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: ['library'] });
      if (v.type === 'artist') void qc.invalidateQueries({ queryKey: qk.artist(v.id) });
      if (v.type === 'playlist') void qc.invalidateQueries({ queryKey: qk.playlist(v.id) });
      if (v.type === 'album') {
        // The album's songs were liked / un-liked too.
        void qc.invalidateQueries({ queryKey: qk.likedIds });
        void qc.invalidateQueries({ queryKey: qk.likedTracks });
      }
    },
  });
}

export function usePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { type: string; id: string; pinned: boolean }) => put('/me/library/pin', v),
    onError: (err) => toast(errorMessage(err)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['library'] }),
  });
}

export function useCreatePlaylist() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (body: { name?: string; trackIds?: string[] } = {}) => post<Playlist>('/me/playlists', body),
    onSuccess: (p, body) => {
      void qc.invalidateQueries({ queryKey: ['library'] });
      if (!body?.trackIds?.length) navigate(`/playlist/${p.id}`);
      else toast(t('menu.addToPlaylist') + ` • ${p.name}`);
    },
    onError: (err) => toast(errorMessage(err)),
  });
}

export function useAddToPlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistId, trackIds }: { playlistId: string; trackIds: string[]; name?: string }) =>
      post(`/playlists/${playlistId}/tracks`, { trackIds }),
    onSuccess: (_d, v) => {
      toast(i18n.language === 'vi' ? `Đã thêm vào ${v.name ?? ''}` : `Added to ${v.name ?? 'playlist'}`);
      void qc.invalidateQueries({ queryKey: qk.playlistTracks(v.playlistId) });
      void qc.invalidateQueries({ queryKey: qk.playlist(v.playlistId) });
      void qc.invalidateQueries({ queryKey: ['library'] });
    },
    onError: (err) => toast(errorMessage(err)),
  });
}

export function useRemoveFromPlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistId, itemIds }: { playlistId: string; itemIds: string[] }) => del(`/playlists/${playlistId}/tracks`, { itemIds }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: qk.playlistTracks(v.playlistId) });
      void qc.invalidateQueries({ queryKey: qk.playlist(v.playlistId) });
    },
    onError: (err) => toast(errorMessage(err)),
  });
}

export function useMovePlaylistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistId, itemId, toIndex }: { playlistId: string; itemId: string; toIndex: number }) =>
      put(`/playlists/${playlistId}/tracks/${itemId}/position`, { toIndex }),
    onSettled: (_d, _e, v) => qc.invalidateQueries({ queryKey: qk.playlistTracks(v.playlistId) }),
    onError: (err) => toast(errorMessage(err)),
  });
}

export function useUpdatePlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; description?: string | null; isPublic?: boolean; isCollaborative?: boolean; coverPath?: string | null }) =>
      patch<Playlist>(`/playlists/${id}`, body),
    onSuccess: (p) => {
      qc.setQueryData(qk.playlist(p.id), p);
      void qc.invalidateQueries({ queryKey: ['library'] });
    },
    onError: (err) => toast(errorMessage(err)),
  });
}

export function useDeletePlaylist() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (id: string) => del(`/playlists/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['library'] });
      navigate('/');
    },
    onError: (err) => toast(errorMessage(err)),
  });
}

export function useTrackFeedback() {
  return useMutation({
    mutationFn: ({ trackId, kind }: { trackId: string; kind: 'hide' | 'snooze' | 'exclude_taste' }) => put(`/me/tracks/${trackId}/feedback`, { kind }),
    onError: (err) => toast(errorMessage(err)),
  });
}

export function useRadio() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (seed: { type: 'track' | 'artist' | 'album' | 'playlist'; id: string }) => post<{ playlistId: string }>('/radio', seed),
    onSuccess: (r) => navigate(`/playlist/${r.playlistId}`),
    onError: (err) => toast(errorMessage(err)),
  });
}

export function useRecentSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { type: string; id: string }) => post('/me/search/recent', v),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.recentSearches }),
  });
}

// ── Social ───────────────────────────────────────────────────────────────────
export function useFollowUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, follow }: { id: string; follow: boolean }) => (follow ? put(`/users/${id}/follow`) : del(`/users/${id}/follow`)),
    onMutate: ({ id, follow }) => {
      const prev = qc.getQueryData<UserProfile>(['profile', id]);
      if (prev) qc.setQueryData(['profile', id], { ...prev, isFollowing: follow, followersCount: prev.followersCount + (follow ? 1 : -1) });
      return { prev };
    },
    onError: (err, v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['profile', v.id], ctx.prev);
      toast(errorMessage(err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['friend-activity'] }),
  });
}

export function useMarkFeedSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post('/content-feed/seen'),
    onSuccess: () => qc.setQueryData(['content-feed-unseen'], { count: 0 }),
  });
}

// ── Podcasts ─────────────────────────────────────────────────────────────────
function invalidateEpisodes(qc: QueryClient) {
  for (const key of ['saved-episodes', 'show', 'show-episodes', 'episode', 'library']) void qc.invalidateQueries({ queryKey: [key] });
}

export function useToggleSavedEpisode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) => (saved ? put('/me/episodes', { ids: [id] }) : del('/me/episodes', { ids: [id] })),
    onSuccess: (_d, v) => toast(t(v.saved ? 'podcast.savedToEpisodes' : 'podcast.removedFromEpisodes')),
    onError: (err) => toast(errorMessage(err)),
    onSettled: () => invalidateEpisodes(qc),
  });
}

export function useEpisodeProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) => put(`/me/episodes/${id}/progress`, { completed, positionMs: 0 }),
    onError: (err) => toast(errorMessage(err)),
    onSettled: () => invalidateEpisodes(qc),
  });
}

// ── Uploads ──────────────────────────────────────────────────────────────────
export interface UploadMeta {
  title: string;
  artistName?: string;
  genre?: string | null;
  moods?: string[];
  visibility: 'public' | 'private';
  explicit?: boolean;
  lyrics?: string | null;
  coverPath?: string | null;
}

export function useUpdateUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<UploadMeta> & { id: string }) => patch<Track>(`/uploads/${id}`, body),
    onSuccess: (track) => {
      qc.setQueryData(qk.track(track.id), track);
      void qc.invalidateQueries({ queryKey: ['my-uploads'] });
      void qc.invalidateQueries({ queryKey: ['community'] });
      toast(t('upload.saved'));
    },
    onError: (err) => toast(errorMessage(err)),
  });
}

export function useDeleteUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/uploads/${id}`),
    onSuccess: () => {
      for (const key of ['my-uploads', 'community', 'library']) void qc.invalidateQueries({ queryKey: [key] });
      toast(t('upload.deleted'));
    },
    onError: (err) => toast(errorMessage(err)),
  });
}

export function useReportTrack() {
  return useMutation({
    mutationFn: ({ id, reason, details }: { id: string; reason: string; details?: string }) => post(`/tracks/${id}/report`, { reason, details }),
    onSuccess: () => toast(t('report.thanks')),
    onError: (err) => toast(errorMessage(err)),
  });
}

// ── AI Playlist ──────────────────────────────────────────────────────────────
export function useCreateAiPlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prompt: string) => post<AiPlaylistResult>('/ai/playlist', { prompt }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['library'] });
      void qc.invalidateQueries({ queryKey: ['ai-status'] });
    },
  });
}

export function useRefineAiPlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, prompt }: { id: string; prompt: string }) => post<AiPlaylistResult>(`/ai/playlist/${id}/refine`, { prompt }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: qk.playlist(r.playlistId) });
      void qc.invalidateQueries({ queryKey: qk.playlistTracks(r.playlistId) });
      void qc.invalidateQueries({ queryKey: ['ai-status'] });
      toast(t('ai.refined'));
    },
    onError: (err) => toast(errorMessage(err)),
  });
}

// ── Account ──────────────────────────────────────────────────────────────────
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<UserSettings>) => patch<Me>('/me/settings', body),
    onMutate: (body) => {
      const prev = qc.getQueryData<{ me: Me | null }>(qk.session);
      if (prev?.me) qc.setQueryData(qk.session, { me: { ...prev.me, settings: { ...prev.me.settings, ...body } } });
      return { prev };
    },
    onSuccess: (me) => qc.setQueryData(qk.session, { me }),
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.session, ctx.prev);
      toast(errorMessage(err));
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { displayName?: string; locale?: 'vi' | 'en' }) => patch<Me>('/me', body),
    onSuccess: (me) => {
      qc.setQueryData(qk.session, { me });
      void qc.invalidateQueries({ queryKey: ['profile', me.id] });
    },
    onError: (err) => toast(errorMessage(err)),
  });
}
