/**
 * Data hooks (TanStack Query). Each hook = one backend endpoint, cached under a stable key.
 * Components never call fetch directly: they use these hooks, so caching/refetching is consistent.
 */
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  AiIntent, Album, Artist, Card, Category, Episode, EpisodePage, FeedItem, FriendActivity, LibraryEntry, Me, Paging, PaymentRecord, Playlist,
  PlaylistTrack, PlansResponse, RecentItem, SearchResults, Section, ShowPage, SubscriptionSummary, Track, UserProfile,
} from '@contracts';
import { get } from '@/lib/api';

export const qk = {
  session: ['session'] as const,
  home: (filter: string) => ['home', filter] as const,
  section: (id: string) => ['section', id] as const,
  categories: ['categories'] as const,
  category: (id: string) => ['category', id] as const,
  artist: (id: string) => ['artist', id] as const,
  album: (id: string) => ['album', id] as const,
  playlist: (id: string) => ['playlist', id] as const,
  playlistTracks: (id: string) => ['playlist-tracks', id] as const,
  playlistRecs: (id: string, n: number) => ['playlist-recs', id, n] as const,
  track: (id: string) => ['track', id] as const,
  credits: (id: string) => ['credits', id] as const,
  library: (filter: string | null, sort: string, q: string) => ['library', filter, sort, q] as const,
  likedIds: ['liked-ids'] as const,
  savedIds: ['saved-ids'] as const,
  likedTracks: ['liked-tracks'] as const,
  search: (q: string, type: string) => ['search', q, type] as const,
  recentSearches: ['recent-searches'] as const,
  lyrics: (id: string) => ['lyrics', id] as const,
};

export function useSession() {
  return useQuery({ queryKey: qk.session, queryFn: () => get<{ me: Me | null }>('/auth/session'), staleTime: 5 * 60_000 });
}
export const useMe = (): Me | null => useSession().data?.me ?? null;

export const useHome = (filter: string) =>
  useQuery({ queryKey: qk.home(filter), queryFn: () => get<{ sections: Section[] }>(`/browse/home?filter=${filter}`), placeholderData: keepPreviousData });

export const useSectionPage = (id: string) => useQuery({ queryKey: qk.section(id), queryFn: () => get<Section>(`/browse/sections/${id}`), enabled: Boolean(id) });
export const useCategories = () => useQuery({ queryKey: qk.categories, queryFn: () => get<{ items: Category[] }>('/browse/categories'), staleTime: 30 * 60_000 });
export const useCategoryPage = (id: string) =>
  useQuery({ queryKey: qk.category(id), queryFn: () => get<{ category: Category; sections: Section[] }>(`/browse/categories/${id}`) });

export interface ArtistPage {
  artist: Artist;
  topTracks: Track[];
  releases: { popular: Card[]; albums: Card[]; singles: Card[]; compilations: Card[] };
  related: Card[];
  featuring: Card[];
}
export const useArtistPage = (id: string) => useQuery({ queryKey: qk.artist(id), queryFn: () => get<ArtistPage>(`/artists/${id}`), enabled: Boolean(id) });
export const useDiscography = (id: string, group: string) =>
  useQuery({ queryKey: ['discography', id, group], queryFn: () => get<{ items: Card[] }>(`/artists/${id}/discography?group=${group}`) });

export const useAlbumPage = (id: string) => useQuery({ queryKey: qk.album(id), queryFn: () => get<{ album: Album; moreBy: Card[] }>(`/albums/${id}`), enabled: Boolean(id) });
export const usePlaylist = (id: string) => useQuery({ queryKey: qk.playlist(id), queryFn: () => get<Playlist>(`/playlists/${id}`), enabled: Boolean(id) });

export function usePlaylistTracks(id: string) {
  return useInfiniteQuery({
    queryKey: qk.playlistTracks(id),
    queryFn: ({ pageParam }) => get<Paging<PlaylistTrack>>(`/playlists/${id}/tracks?offset=${pageParam}&limit=100`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
}

export const usePlaylistRecommendations = (id: string, refresh: number, enabled: boolean) =>
  useQuery({
    queryKey: qk.playlistRecs(id, refresh),
    queryFn: () => get<{ items: Track[] }>(`/playlists/${id}/recommendations?refresh=${refresh}`),
    enabled,
    placeholderData: keepPreviousData,
  });

export const useTrack = (id: string) => useQuery({ queryKey: qk.track(id), queryFn: () => get<Track>(`/tracks/${id}`), enabled: Boolean(id) });

export interface Credits {
  track: Track;
  performedBy: { id: string; name: string }[];
  genre: string | null;
  moods: string[];
  source: { provider: string; url: string | null };
}
export const useCredits = (id: string | null) =>
  useQuery({ queryKey: qk.credits(id ?? ''), queryFn: () => get<Credits>(`/tracks/${id}/credits`), enabled: Boolean(id) });

export function useLibrary(filter: string | null, sort: string, q: string, enabled: boolean) {
  const params = new URLSearchParams({ sort, ...(filter && { filter }), ...(q && { q }) });
  return useQuery({
    queryKey: qk.library(filter, sort, q),
    queryFn: () => get<{ items: LibraryEntry[] }>(`/me/library?${params}`),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Set of liked track ids — one request for the whole app, O(1) "is liked?" checks. */
export function useLikedIds(enabled: boolean) {
  return useQuery({ queryKey: qk.likedIds, queryFn: async () => new Set(await get<string[]>('/me/tracks/ids')), enabled, staleTime: 60_000 });
}

/** Set of "type:id" for saved albums, followed artists/playlists/shows. */
export function useSavedIds(enabled: boolean) {
  return useQuery({ queryKey: qk.savedIds, queryFn: async () => new Set(await get<string[]>('/me/library/ids')), enabled, staleTime: 60_000 });
}

export function useLikedTracks(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: qk.likedTracks,
    queryFn: ({ pageParam }) => get<Paging<Track & { addedAt: string; itemId: string }> & { durationMs: number }>(`/me/tracks?offset=${pageParam}&limit=100`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled,
  });
}

export const useSearch = (q: string, type: string) =>
  useQuery({
    queryKey: qk.search(q, type),
    queryFn: ({ signal }) => get<SearchResults>(`/search?q=${encodeURIComponent(q)}&type=${type}&limit=${type === 'all' ? 10 : 50}`, signal),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
  });

export const useRecentSearches = (enabled: boolean) =>
  useQuery({ queryKey: qk.recentSearches, queryFn: () => get<{ items: Card[] }>('/me/search/recent'), enabled });

// ── People & social ──────────────────────────────────────────────────────────
export const useProfile = (id: string) => useQuery({ queryKey: ['profile', id], queryFn: () => get<UserProfile>(`/users/${id}`), enabled: Boolean(id) });

export const useProfileList = (id: string, list: string) =>
  useQuery({ queryKey: ['profile-list', id, list], queryFn: () => get<Section>(`/users/${id}/lists/${list}?limit=50`) });

export const useFriendActivity = (enabled: boolean) =>
  useQuery({ queryKey: ['friend-activity'], queryFn: () => get<{ items: FriendActivity[] }>('/me/friend-activity'), enabled, refetchInterval: 60_000 });

export const useContentFeed = (filter: string | null) =>
  useQuery({ queryKey: ['content-feed', filter], queryFn: () => get<{ items: FeedItem[] }>(`/content-feed${filter ? `?filter=${filter}` : ''}`) });

/** Blue dot on the bell: releases since the feed was last opened (checked every 5 minutes). */
export const useFeedUnseen = (enabled: boolean) =>
  useQuery({ queryKey: ['content-feed-unseen'], queryFn: () => get<{ count: number }>('/content-feed/unseen'), enabled, refetchInterval: 5 * 60_000 });

export const useRecents = (enabled: boolean) =>
  useQuery({ queryKey: ['recents'], queryFn: () => get<{ items: RecentItem[] }>('/me/recents?limit=100'), enabled });

// ── Podcasts ─────────────────────────────────────────────────────────────────
export const useShowPage = (id: string) => useQuery({ queryKey: ['show', id], queryFn: () => get<ShowPage>(`/shows/${id}`), enabled: Boolean(id) });

export function useShowEpisodes(id: string, sort: 'newest' | 'oldest') {
  return useInfiniteQuery({
    queryKey: ['show-episodes', id, sort],
    queryFn: ({ pageParam }) => get<Paging<Episode>>(`/shows/${id}/episodes?sort=${sort}&offset=${pageParam}&limit=30`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
}

export const useEpisodePage = (id: string) => useQuery({ queryKey: ['episode', id], queryFn: () => get<EpisodePage>(`/episodes/${id}`), enabled: Boolean(id) });

export function useSavedEpisodes(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['saved-episodes'],
    queryFn: ({ pageParam }) => get<Paging<Episode>>(`/me/episodes?offset=${pageParam}&limit=50`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled,
  });
}

// ── Uploads & community ──────────────────────────────────────────────────────
export interface UploadOptions { genres: string[]; moods: string[]; audioTypes: string[] }
export const useUploadOptions = () => useQuery({ queryKey: ['upload-options'], queryFn: () => get<UploadOptions>('/uploads/options'), staleTime: Infinity });

export interface MyUpload { track: Track; analysisStatus: 'pending' | 'done' | 'failed' }
export const useMyUploads = (enabled: boolean) =>
  useQuery({
    queryKey: ['my-uploads'],
    queryFn: () => get<{ items: MyUpload[] }>('/me/uploads'),
    enabled,
    // While a song is being analysed (BPM, key…), check again every few seconds.
    refetchInterval: (q) => (q.state.data?.items.some((i) => i.analysisStatus === 'pending') ? 4000 : false),
  });

export function useCommunityTracks(sort: 'new' | 'popular', genre: string | null) {
  return useInfiniteQuery({
    queryKey: ['community', sort, genre],
    queryFn: ({ pageParam }) => get<Paging<Track>>(`/community/tracks?sort=${sort}&offset=${pageParam}&limit=50${genre ? `&genre=${genre}` : ''}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
}

// ── AI Playlist ──────────────────────────────────────────────────────────────
export interface AiStatus { available: boolean; limit: number; remaining: number; usesGemini: boolean; suggestions: string[] }
export const useAiStatus = (enabled: boolean) => useQuery({ queryKey: ['ai-status'], queryFn: () => get<AiStatus>('/ai/status'), enabled });
export type { AiIntent };

// ── Premium & account ────────────────────────────────────────────────────────
export const usePlans = () => useQuery({ queryKey: ['plans'], queryFn: () => get<PlansResponse>('/plans') });
export const useSubscription = (enabled: boolean) =>
  useQuery({ queryKey: ['subscription'], queryFn: () => get<{ subscription: SubscriptionSummary | null }>('/me/subscription'), enabled });
export const usePayments = (enabled: boolean) =>
  useQuery({ queryKey: ['payments'], queryFn: () => get<{ items: PaymentRecord[] }>('/me/payments'), enabled });

export interface AuthPolicy { passwordRules: { id: string; pattern: string }[]; minAge: number; genders: string[]; oauthProviders: ('google' | 'facebook' | 'apple')[] }
export const useAuthPolicy = () => useQuery({ queryKey: ['auth-policy'], queryFn: () => get<AuthPolicy>('/auth/policy'), staleTime: Infinity });
