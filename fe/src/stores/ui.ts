/**
 * UI-only state (panel sizes, which right panel is open, library view…) — persisted per browser.
 * Business state lives on the backend; this store only remembers how the user arranged the screen.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type RightPanel = 'npv' | 'queue' | 'devices' | 'friends' | null;
export type LibraryView = 'compact' | 'list' | 'grid';
export type LibrarySort = 'recents' | 'added' | 'alpha' | 'creator';
export type LibraryFilter = 'playlists' | 'artists' | 'albums' | 'podcasts' | null;

export const LEFT_COLLAPSED_WIDTH = 72;
export const LEFT_MIN = 280;
export const LEFT_MAX = 420;
export const LEFT_EXPANDED = 0.6; // expanded library takes this share of the window
export const RIGHT_MIN = 280;
export const RIGHT_MAX = 420;

interface UiState {
  leftWidth: number;
  leftCollapsed: boolean;
  leftExpanded: boolean;
  rightWidth: number;
  rightPanel: RightPanel;
  npvEnabled: boolean;
  libraryView: LibraryView;
  librarySort: LibrarySort;
  libraryFilter: LibraryFilter;
  trackListDensity: 'list' | 'compact';
  loginPrompt: { kind: 'play' | 'library' | 'playlist' | 'follow'; imageUrl?: string | null; color?: string | null } | null;
  fullscreen: boolean;
  setFullscreen: (v: boolean) => void;
  setLeftWidth: (w: number) => void;
  toggleLeftCollapsed: () => void;
  setLeftExpanded: (v: boolean) => void;
  setRightWidth: (w: number) => void;
  toggleRightPanel: (p: Exclude<RightPanel, null>) => void;
  setRightPanel: (p: RightPanel) => void;
  setLibraryView: (v: LibraryView) => void;
  setLibrarySort: (v: LibrarySort) => void;
  setLibraryFilter: (v: LibraryFilter) => void;
  setTrackListDensity: (v: 'list' | 'compact') => void;
  showLoginPrompt: (p: UiState['loginPrompt']) => void;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      leftWidth: 320,
      leftCollapsed: false,
      leftExpanded: false,
      rightWidth: 360,
      rightPanel: 'npv',
      npvEnabled: true,
      libraryView: 'list',
      librarySort: 'recents',
      libraryFilter: null,
      trackListDensity: 'list',
      loginPrompt: null,
      fullscreen: false,
      setFullscreen: (fullscreen) => set({ fullscreen }),
      setLeftWidth: (w) => set({ leftWidth: clamp(w, LEFT_MIN, LEFT_MAX), leftCollapsed: false }),
      toggleLeftCollapsed: () => set({ leftCollapsed: !get().leftCollapsed, leftExpanded: false }),
      setLeftExpanded: (v) => set({ leftExpanded: v, leftCollapsed: false }),
      setRightWidth: (w) => set({ rightWidth: clamp(w, RIGHT_MIN, RIGHT_MAX) }),
      toggleRightPanel: (p) => {
        const open = get().rightPanel === p;
        set({ rightPanel: open ? null : p, ...(p === 'npv' && { npvEnabled: !open }) });
      },
      setRightPanel: (p) => set({ rightPanel: p }),
      setLibraryView: (v) => set({ libraryView: v }),
      setLibrarySort: (v) => set({ librarySort: v }),
      setLibraryFilter: (v) => set({ libraryFilter: v }),
      setTrackListDensity: (v) => set({ trackListDensity: v }),
      showLoginPrompt: (p) => set({ loginPrompt: p }),
    }),
    {
      name: 'melodify.ui',
      partialize: (s) => ({
        leftWidth: s.leftWidth, leftCollapsed: s.leftCollapsed, rightWidth: s.rightWidth, rightPanel: s.rightPanel,
        npvEnabled: s.npvEnabled, libraryView: s.libraryView, librarySort: s.librarySort, trackListDensity: s.trackListDensity,
      }),
    },
  ),
);
