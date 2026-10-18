/**
 * Routes mirror open.spotify.com URLs (/playlist/:id, /album/:id, /artist/:id, /search/:q …).
 * Pages are lazy-loaded: each one is downloaded the first time it's visited (code splitting).
 */
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppLayout } from '@/layout/AppLayout';
import { RouteError } from './RouteError';
import { RouteFallback } from './RouteFallback';
import { StandaloneLayout } from './StandaloneLayout';

const page = (loader: () => Promise<Record<string, unknown>>, name: string): Pick<RouteObject, 'lazy' | 'hydrateFallbackElement'> => ({
  lazy: async () => ({ Component: (await loader())[name] as React.ComponentType }),
  // On a direct visit the layout renders at once and only the page area waits for its code.
  hydrateFallbackElement: <RouteFallback />,
});

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, ...page(() => import('@/pages/home/HomePage'), 'HomePage') },
      { path: 'search', ...page(() => import('@/pages/search/SearchPage'), 'SearchPage') },
      { path: 'search/:query/:tab?', ...page(() => import('@/pages/search/SearchPage'), 'SearchPage') },
      { path: 'genre/:id', ...page(() => import('@/pages/browse/CategoryPage'), 'CategoryPage') },
      { path: 'section/:id', ...page(() => import('@/pages/browse/SectionPage'), 'SectionPage') },
      { path: 'playlist/:id', ...page(() => import('@/pages/playlist/PlaylistPage'), 'PlaylistPage') },
      { path: 'album/:id', ...page(() => import('@/pages/album/AlbumPage'), 'AlbumPage') },
      { path: 'artist/:id', ...page(() => import('@/pages/artist/ArtistPage'), 'ArtistPage') },
      { path: 'artist/:id/discography/:group?', ...page(() => import('@/pages/artist/DiscographyPage'), 'DiscographyPage') },
      { path: 'artist/:id/related', ...page(() => import('@/pages/artist/RelatedPage'), 'RelatedPage') },
      { path: 'track/:id', ...page(() => import('@/pages/track/TrackPage'), 'TrackPage') },
      { path: 'collection', ...page(() => import('@/pages/collection/LibraryPage'), 'LibraryPage') },
      { path: 'collection/tracks', ...page(() => import('@/pages/collection/LikedSongsPage'), 'LikedSongsPage') },
      { path: 'collection/uploads', ...page(() => import('@/pages/uploads/MyUploadsPage'), 'MyUploadsPage') },
      { path: 'collection/episodes', ...page(() => import('@/pages/podcasts/YourEpisodesPage'), 'YourEpisodesPage') },
      { path: 'lyrics', ...page(() => import('@/pages/lyrics/LyricsPage'), 'LyricsPage') },
      { path: 'user/:id', ...page(() => import('@/pages/profile/ProfilePage'), 'ProfilePage') },
      { path: 'user/:id/:list', ...page(() => import('@/pages/profile/ProfilePage'), 'ProfilePage') },
      { path: 'preferences', ...page(() => import('@/pages/settings/SettingsPage'), 'SettingsPage') },
      { path: 'content-feed', ...page(() => import('@/pages/feed/WhatsNewPage'), 'WhatsNewPage') },
      { path: 'recents', ...page(() => import('@/pages/feed/RecentsPage'), 'RecentsPage') },
      { path: 'ai-playlist', ...page(() => import('@/pages/ai/AiPlaylistPage'), 'AiPlaylistPage') },
      { path: 'uploads/new', ...page(() => import('@/pages/uploads/UploadPage'), 'UploadPage') },
      { path: 'uploads/:id/edit', ...page(() => import('@/pages/uploads/UploadPage'), 'UploadPage') },
      { path: 'community', ...page(() => import('@/pages/uploads/CommunityPage'), 'CommunityPage') },
      { path: 'show/:id', ...page(() => import('@/pages/podcasts/ShowPage'), 'ShowPage') },
      { path: 'episode/:id', ...page(() => import('@/pages/podcasts/EpisodePage'), 'EpisodePage') },
      { path: 'folder/:id', ...page(() => import('@/pages/collection/FolderPage'), 'FolderPage') },
      { path: 'invite/:token', ...page(() => import('@/pages/playlist/InvitePage'), 'InvitePage') },
      { path: 'download', ...page(() => import('@/pages/misc/DownloadPage'), 'DownloadPage') },
      { path: '*', ...page(() => import('@/pages/misc/NotFoundPage'), 'NotFoundPage') },
    ],
  },
  // Pages with their own full-screen layout, like accounts.spotify.com and spotify.com/premium.
  {
    element: <StandaloneLayout />,
    errorElement: <RouteError />,
    children: [
      { path: 'login', ...page(() => import('@/pages/auth/LoginPage'), 'LoginPage') },
      { path: 'signup', ...page(() => import('@/pages/auth/SignupPage'), 'SignupPage') },
      { path: 'password-reset', ...page(() => import('@/pages/auth/PasswordResetPage'), 'PasswordResetPage') },
      { path: 'premium', ...page(() => import('@/pages/premium/PremiumPage'), 'PremiumPage') },
      { path: 'checkout/:option', ...page(() => import('@/pages/premium/CheckoutPage'), 'CheckoutPage') },
      { path: 'account', ...page(() => import('@/pages/premium/AccountPage'), 'AccountPage') },
    ],
  },
]);
