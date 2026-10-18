/**
 * API contracts — the shapes the backend sends to clients (web now, mobile later).
 *
 * Types only: the frontend imports them with `import type`, which is erased at build time,
 * so no backend code ever ends up in the browser bundle.
 *
 * Rule: the backend sends DATA, never UI text. Titles come as i18n keys + params
 * (e.g. { titleKey: 'home.madeFor', titleParams: { name: 'HDK' } }) and the UI translates them.
 */

// ── Common ───────────────────────────────────────────────────────────────────
export type Locale = 'vi' | 'en';
export type Product = 'free' | 'premium';
export type ReleaseType = 'album' | 'single' | 'ep' | 'compilation';
export type Origin = 'catalog' | 'upload';
export type Visibility = 'public' | 'private';
export type AudioQuality = 'automatic' | 'low' | 'normal' | 'high' | 'very_high' | 'lossless';

export interface Paging<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  nextOffset: number | null;
}

export interface ApiErrorBody {
  error: { code: string; message?: string; details?: unknown };
}

// ── People ───────────────────────────────────────────────────────────────────
export interface UserRef {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

/** A public profile page (/user/:id). Sections follow Spotify's order; empty ones are left out. */
export interface UserProfile extends UserRef {
  /** Header gradient colour (from the avatar). */
  color: string | null;
  followersCount: number;
  followingCount: number;
  publicPlaylistsCount: number;
  isFollowing: boolean;
  isMe: boolean;
  sections: Section[];
}

/** "Listening activity" panel: what the people you follow are playing. */
export interface FriendActivity {
  user: UserRef;
  track: Track;
  context: PlayContext | null;
  /** When they started it. */
  at: string;
  /** Still playing right now. */
  isNow: boolean;
}

/** One row in "What's New": a release from an artist / show / creator you follow. */
export interface FeedItem {
  kind: 'release' | 'episode' | 'upload';
  card: Card;
  date: string;
  /** Released after you last opened What's New (blue dot). */
  isNew: boolean;
}

/** One row in Recents (/recents): something you played, newest first. */
export interface RecentItem {
  card: Card;
  playedAt: string;
}

// ── Catalog ──────────────────────────────────────────────────────────────────
export interface ArtistRef {
  id: string;
  name: string;
}

export interface Artist extends ArtistRef {
  avatarUrl: string | null;
  bannerUrl: string | null;
  dominantColor: string | null;
  verified: boolean;
  genres: string[];
  followersCount: number;
  monthlyListeners: number;
  bio: string | null;
  externalUrl: string | null;
  /** Creator profile of a user who uploads music (not a catalog artist). */
  isCreator: boolean;
  isFollowing: boolean;
}

export interface AlbumRef {
  id: string;
  title: string;
  coverUrl: string | null;
}

export interface Album extends AlbumRef {
  releaseType: ReleaseType;
  releaseDate: string | null;
  artists: ArtistRef[];
  dominantColor: string | null;
  label: string | null;
  copyright: string | null;
  totalTracks: number;
  durationMs: number;
  tracks: Track[];
  isSaved: boolean;
}

export interface TrackFeatures {
  bpm: number | null;
  /** Short key label, e.g. "E♭m". */
  key: string | null;
  /** Camelot wheel code, e.g. "2A". */
  camelot: string | null;
  energy: number | null;
}

export interface Track {
  id: string;
  title: string;
  durationMs: number;
  explicit: boolean;
  artists: ArtistRef[];
  album: AlbumRef | null;
  origin: Origin;
  visibility: Visibility;
  uploader: UserRef | null;
  genre: string | null;
  features: TrackFeatures;
  playCount: number;
  releaseDate: string | null;
  isPlayable: boolean;
}

export interface PlaylistTrack extends Track {
  itemId: string;
  addedAt: string;
  addedBy: UserRef | null;
  /** Mix mode: how this item blends into the next one. */
  transition: TransitionRecipe | null;
}

// ── Mix transitions (decided by the backend, executed by the audio engine) ──
export type TransitionPreset = 'fade' | 'rise' | 'blend' | 'wave' | 'melt' | 'slam';

export interface CurvePoint {
  t: number;
  v: number;
}

export interface FilterSweep {
  type: 'lowpass' | 'highpass' | 'lowshelf';
  param: 'frequency' | 'gain';
  curve: CurvePoint[];
  frequency?: number;
}

export interface TransitionRecipe {
  preset: TransitionPreset;
  durationMs: number;
  out: { gain: CurvePoint[]; filter?: FilterSweep };
  in: { gain: CurvePoint[]; filter?: FilterSweep };
  tempoMatchRate: number | null;
  auto: boolean;
}

// ── Playlists ────────────────────────────────────────────────────────────────
export type PlaylistKind = 'user' | 'editorial' | 'mix' | 'radio' | 'ai' | 'imported';

/** Generated covers (Daily Mix, Artist Mix, Radio…) are drawn by the UI from this description. */
export interface MixCover {
  style: 'daily' | 'artist' | 'genre' | 'mood' | 'decade' | 'radio' | 'discover' | 'release_radar' | 'on_repeat' | 'ai';
  label: string;
  color: string;
  imageUrl: string | null;
}

export interface Playlist {
  id: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  mosaic: string[];
  mixCover: MixCover | null;
  kind: PlaylistKind;
  owner: UserRef | null;
  /** App name for editorial playlists, owner's display name otherwise. */
  ownerName: string;
  dominantColor: string | null;
  isPublic: boolean;
  isCollaborative: boolean;
  mixEnabled: boolean;
  followersCount: number;
  totalTracks: number;
  durationMs: number;
  updatedAt: string;
  collaborators: UserRef[];
  isSaved: boolean;
  permissions: { canEdit: boolean; canDelete: boolean; canInvite: boolean; canMix: boolean };
  /** AI playlists: the prompts so far and how the AI understood them (shown to the owner only). */
  ai?: { prompts: string[]; intent: AiIntent; usedAi: boolean } | null;
}

// ── Podcasts ─────────────────────────────────────────────────────────────────
export interface ShowRef {
  id: string;
  title: string;
  publisher: string | null;
  imageUrl: string | null;
}

export interface Show extends ShowRef {
  description: string | null;
  dominantColor: string | null;
  categories: string[];
  explicit: boolean;
  totalEpisodes: number;
  isFollowing: boolean;
}

export interface Episode {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  durationMs: number;
  releaseDate: string | null;
  explicit: boolean;
  show: ShowRef;
  progress: { positionMs: number; completed: boolean } | null;
  isSaved: boolean;
}

export interface ShowPage {
  show: Show & { websiteUrl: string | null; language: string | null };
  episodes: Paging<Episode>;
  /** "You might also like". */
  related: Card[];
}

export interface EpisodePage {
  episode: Episode;
  show: Show;
  /** Newer/older episodes of the same show. */
  more: Episode[];
}

// ── AI Playlist ──────────────────────────────────────────────────────────────
/** What the AI understood from the prompt (also shown to the user as editable "chips"). */
export interface AiIntent {
  title: string;
  description: string;
  genres: string[];
  moods: string[];
  /** 0…1 ranges, null = don't care. */
  energy: [number, number] | null;
  valence: [number, number] | null;
  bpm: [number, number] | null;
  decades: number[];
  artists: string[];
  keywords: string[];
  count: number;
}

export interface AiPlaylistResult {
  playlistId: string;
  intent: AiIntent;
  /** false = Gemini unavailable, the keyword fallback interpreted the prompt. */
  usedAi: boolean;
  remainingToday: number;
}

// ── Cards, shelves, home ─────────────────────────────────────────────────────
export type EntityType = 'track' | 'album' | 'artist' | 'playlist' | 'show' | 'episode' | 'user' | 'collection' | 'category';

/** A generic tile. The UI composes the subtitle ("Album • 2024", "Playlist • HDK") from these fields. */
export interface Card {
  type: EntityType;
  id: string;
  name: string;
  /** melodify:<type>:<id> — what "play" on this card starts. */
  uri: string;
  imageUrl: string | null;
  mosaic?: string[];
  mixCover?: MixCover | null;
  description?: string | null;
  ownerName?: string | null;
  artists?: ArtistRef[];
  releaseType?: ReleaseType;
  releaseDate?: string | null;
  publisher?: string | null;
  durationMs?: number;
  explicit?: boolean;
  verified?: boolean;
  color?: string | null;
  /** Shown instead of the usual subtitle on profile pages ("12 Followers"). */
  followersCount?: number;
}

export interface Section {
  id: string;
  layout: 'shortcuts' | 'shelf' | 'episodes' | 'tracks';
  titleKey: string;
  titleParams?: Record<string, string>;
  /** Small grey line under the title, e.g. "Only visible to you". */
  subtitleKey?: string;
  /** Client route for "Show all". */
  seeAllPath?: string;
  items: Card[];
  tracks?: Track[];
}

export interface Category {
  id: string;
  name: string;
  color: string;
  imageUrl: string | null;
  kind: string;
}

// ── Library ──────────────────────────────────────────────────────────────────
export type CollectionId = 'liked' | 'episodes' | 'uploads';

export interface LibraryEntry {
  type: 'playlist' | 'album' | 'artist' | 'show' | 'collection' | 'folder';
  id: string;
  name: string;
  uri: string;
  imageUrl: string | null;
  mosaic?: string[];
  mixCover?: MixCover | null;
  collection?: CollectionId;
  ownerName?: string | null;
  artists?: ArtistRef[];
  releaseType?: ReleaseType;
  publisher?: string | null;
  itemCount?: number;
  pinned: boolean;
  addedAt: string;
  lastPlayedAt: string | null;
  folderId: string | null;
  isOwn?: boolean;
}

// ── Me, settings, entitlements ───────────────────────────────────────────────
export interface Entitlements {
  ads: boolean;
  skipsPerHour: number | null;
  onDemandPlayback: boolean;
  smartShuffle: boolean;
  mix: boolean;
  aiPlaylist: boolean;
  aiPlaylistsPerDay: number;
  maxAudioQuality: AudioQuality;
  queueEdit: boolean;
  jamHost: boolean;
  offlineDownload: boolean;
  uploadTracksLimit: number;
  uploadMaxMb: number;
}

export interface UserSettings {
  audioQuality: AudioQuality;
  normalizeVolume: boolean;
  /** 0 = off. Seconds of crossfade between tracks (outside Mix mode). */
  crossfadeSec: number;
  automix: boolean;
  autoplay: boolean;
  allowExplicit: boolean;
  showNowPlayingOnPlay: boolean;
  compactLibrary: boolean;
  privateSession: boolean;
  shareListeningActivity: boolean;
  showFollowsOnProfile: boolean;
  showPlaylistsOnProfile: boolean;
  /** "Show my recently played artists on my public profile". */
  showRecentArtistsOnProfile: boolean;
  publishNewPlaylists: boolean;
}

export interface SubscriptionSummary {
  id: string;
  planId: string;
  planName: string;
  status: 'active' | 'past_due' | 'canceled' | 'expired';
  billingType: 'recurring' | 'prepaid';
  isIntro: boolean;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  nextChargeAmount: number | null;
  /** past_due only: Premium stops on this date unless a retry succeeds. */
  graceUntil: string | null;
}

export interface Me extends UserRef {
  email: string | null;
  product: Product;
  entitlements: Entitlements;
  country: string;
  locale: Locale;
  birthDate: string | null;
  gender: string | null;
  settings: UserSettings;
  subscription: SubscriptionSummary | null;
  isAdmin: boolean;
  createdAt: string;
}

// ── Player ───────────────────────────────────────────────────────────────────
export type ShuffleMode = 'off' | 'shuffle' | 'smart';
export type RepeatMode = 'off' | 'context' | 'track';
export type ContextType =
  | 'playlist' | 'album' | 'artist' | 'collection' | 'show' | 'episode' | 'track' | 'radio' | 'search' | 'uploads' | 'queue';
export type QueueSource = 'context' | 'queue' | 'smart_shuffle' | 'autoplay' | 'radio' | 'ad';

export interface PlayContext {
  type: ContextType;
  id: string | null;
  uri: string;
  name: string | null;
}

export interface AdInfo {
  id: string;
  advertiser: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  clickUrl: string | null;
  bgColor: string | null;
  durationMs: number;
}

export interface QueueItem {
  uid: string;
  kind: 'track' | 'episode' | 'ad';
  source: QueueSource;
  track?: Track;
  episode?: Episode;
  ad?: AdInfo;
}

export interface StreamInfo {
  /** Audio URL to play, or null for a spoken (text-to-speech) ad. */
  url: string | null;
  speech: { text: string; lang: string } | null;
  expiresAt: number | null;
}

export interface DeviceInfo {
  id: string;
  name: string;
  type: 'computer' | 'smartphone' | 'tablet' | 'speaker' | 'tv' | 'web';
  isActive: boolean;
  isOnline: boolean;
  volume: number;
}

export interface PlayerRestrictions {
  /** False while an ad plays: ads can't be paused, skipped or rewound. */
  pause: boolean;
  skipNext: boolean;
  skipPrevious: boolean;
  seek: boolean;
  shuffle: boolean;
  smartShuffle: boolean;
  repeat: boolean;
  queueEdit: boolean;
  /** Why something is disabled, as an i18n-able code. */
  reason: 'ad_playing' | 'skip_limit' | 'premium_required' | null;
}

export interface PlayerView {
  /** Increments on every change; stale commands are rejected (optimistic concurrency). */
  version: number;
  isPlaying: boolean;
  positionMs: number;
  /** Server clock (epoch ms) at which `positionMs` was true. Live position = positionMs + (now − serverTime). */
  serverTime: number;
  shuffle: ShuffleMode;
  repeat: RepeatMode;
  context: PlayContext | null;
  current: QueueItem | null;
  /** "Next in queue" — items the user added. */
  queue: QueueItem[];
  /** "Next from: <context>" — including Smart Shuffle picks and Autoplay. */
  upcoming: QueueItem[];
  /** "Recently played" tab. */
  history: QueueItem[];
  activeDeviceId: string | null;
  devices: DeviceInfo[];
  restrictions: PlayerRestrictions;
  skipsLeft: number | null;
  /** Present only for the device that should be producing sound. */
  stream: StreamInfo | null;
  /** Preload info + transition recipe for the item after `current` (crossfade / Mix). */
  next: { uid: string; stream: StreamInfo; transition: TransitionRecipe | null } | null;
}

// ── Search ───────────────────────────────────────────────────────────────────
export interface SearchResults {
  query: string;
  topResult: Card | null;
  tracks: Paging<Track>;
  artists: Paging<Card>;
  albums: Paging<Card>;
  playlists: Paging<Card>;
  profiles: Paging<Card>;
  shows: Paging<Card>;
  episodes: Paging<Card>;
  uploads: Paging<Track>;
}

// ── Billing ──────────────────────────────────────────────────────────────────
export interface PlanInfo {
  id: string;
  name: string;
  monthlyPrice: number;
  introMonths: number;
  introPrice: number | null;
  accounts: number;
  requiresVerification: 'student' | null;
  color: string | null;
}

export interface PrepaidInfo {
  id: string;
  planId: string;
  months: number;
  price: number;
  /** Compared with paying monthly. */
  savings: number;
}

export interface PlansResponse {
  plans: PlanInfo[];
  prepaid: PrepaidInfo[];
  introEligible: boolean;
  current: SubscriptionSummary | null;
}

export interface CheckoutResult {
  status: 'succeeded' | 'requires_action' | 'failed';
  paymentId: string;
  failureCode?: string;
  subscription?: SubscriptionSummary;
}

export interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'refunded';
  description: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  createdAt: string;
}
