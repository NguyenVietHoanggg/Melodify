/**
 * The app shell — a CSS grid measured on open.spotify.com:
 *
 *   ┌──────────────────── top bar (64px) ────────────────────┐
 *   │ library │ 8px │        main view        │ 8px │ right  │
 *   ├────────────────── player bar (72px) ───────────────────┤
 *
 * Side panels are resizable by dragging the 8px gaps (like Spotify). Tablets and phones get their own
 * arrangements (see DesktopShell / MobileShell below).
 */
import { useEffect, useRef, type CSSProperties, type PointerEvent } from 'react';
import { Outlet } from 'react-router';
import { useMe } from '@/api/queries';
import { useViewport } from '@/lib/viewport';
import { LEFT_COLLAPSED_WIDTH, useUi } from '@/stores/ui';
import { usePlayer } from '@/player/store';
import { BottomNav } from './BottomNav';
import { FullscreenView } from './FullscreenView';
import { CompleteProfileDialog } from './CompleteProfileDialog';
import { GlobalDialogs } from './GlobalDialogs';
import { LeftSidebar } from './LeftSidebar';
import { LoginPrompt } from './LoginPrompt';
import { MainView } from './MainView';
import { MobilePlayer } from './MobilePlayer';
import { NowPlayingBar } from './NowPlayingBar';
import { RightSidebar } from './RightSidebar';
import { SignupBanner } from './SignupBanner';
import { Toaster } from './Toaster';
import { TopBar } from './TopBar';
import styles from './layout.module.css';
import mobile from './mobile.module.css';

function ResizeHandle({ side }: { side: 'left' | 'right' }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const { leftWidth, rightWidth, setLeftWidth, setRightWidth, leftCollapsed, toggleLeftCollapsed } = useUi();
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = {
      x: e.clientX,
      w: side === 'left' ? (leftCollapsed ? LEFT_COLLAPSED_WIDTH : leftWidth) : rightWidth,
    };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    if (side === 'left') {
      const w = start.current.w + dx;
      // Dragging the library narrow enough collapses it to icons, like Spotify.
      if (w < 200 && !leftCollapsed) toggleLeftCollapsed();
      else if (w >= 200) setLeftWidth(w);
    } else {
      setRightWidth(start.current.w - dx);
    }
  };
  return (
    <div
      className={`${styles.resize} ${side === 'left' ? styles.resizeLeft : styles.resizeRight}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => (start.current = null)}
      role="separator"
      aria-orientation="vertical"
      aria-label={side === 'left' ? 'Resize main navigation' : 'Resize Now Playing view'}
    />
  );
}

export function AppLayout() {
  const viewport = useViewport();
  return viewport === 'mobile' ? <MobileShell /> : <DesktopShell tablet={viewport === 'tablet'} />;
}

/** Dialogs, toasts and prompts every layout needs. */
function Overlays() {
  return (
    <>
      <LoginPrompt />
      <GlobalDialogs />
      <CompleteProfileDialog />
      <Toaster />
    </>
  );
}

/**
 * Desktop: the three resizable columns. Tablet: the same, but the library stays a strip of icons and the
 * right panel slides over the page instead of squeezing it.
 */
function DesktopShell({ tablet }: { tablet: boolean }) {
  const me = useMe();
  const ui = useUi();
  const { leftWidth, rightWidth, rightPanel, fullscreen } = ui;
  const leftCollapsed = tablet || ui.leftCollapsed;
  const leftExpanded = !tablet && ui.leftExpanded;
  const hasPlayback = usePlayer((s) => Boolean(s.view?.current));
  const showRight = Boolean(me) && rightPanel !== null && (rightPanel !== 'npv' || hasPlayback);
  const rightColumn = showRight && !tablet;
  const left = leftCollapsed ? LEFT_COLLAPSED_WIDTH : leftWidth;

  const style = {
    '--left-width': `${left}px`,
    '--right-width': `${rightWidth}px`,
    gridTemplateColumns: leftExpanded
      ? `minmax(0, 1fr) ${rightColumn ? 'var(--right-width)' : ''}`
      : `var(--left-width) minmax(0, 1fr) ${rightColumn ? 'var(--right-width)' : ''}`,
    gridTemplateAreas: leftExpanded
      ? `"top ${rightColumn ? 'top' : ''}" "left ${rightColumn ? 'right' : ''}" "bottom ${rightColumn ? 'bottom' : ''}"`
      : `"top top ${rightColumn ? 'top' : ''}" "left main ${rightColumn ? 'right' : ''}" "bottom bottom ${rightColumn ? 'bottom' : ''}"`,
  } as CSSProperties;

  return (
    <>
      {/* While full screen covers the app, what's underneath can't be reached with Tab or a screen reader. */}
      <div className={styles.root} style={style} inert={fullscreen || undefined}>
        <TopBar />
        <LeftSidebar forceCollapsed={tablet} />
        {!leftExpanded && !tablet && <ResizeHandle side="left" />}
        {!leftExpanded && (
          <MainView>
            <Outlet />
          </MainView>
        )}
        {rightColumn && (
          <>
            <ResizeHandle side="right" />
            <RightSidebar />
          </>
        )}
        {showRight && tablet && (
          <div className={styles.drawer}>
            <RightSidebar />
          </div>
        )}
        <div className={styles.bottom}>{me ? <NowPlayingBar /> : <SignupBanner />}</div>
      </div>
      {me && <FullscreenView />}
      <Overlays />
    </>
  );
}

/** Phone: one column, the mini player and the tab bar at the bottom; side panels open full screen. */
function MobileShell() {
  const me = useMe();
  const rightPanel = useUi((s) => s.rightPanel);
  const setRightPanel = useUi((s) => s.setRightPanel);
  // The remembered "open panel" belongs to the desktop layout; on a phone panels open only when asked.
  useEffect(() => setRightPanel(null), [setRightPanel]);
  const panel = me && rightPanel && rightPanel !== 'npv' ? rightPanel : null;
  return (
    <div className={mobile.root}>
      <TopBar />
      <div className={mobile.main}>
        <MainView>
          <Outlet />
        </MainView>
      </div>
      <div className={mobile.player}>{me ? <MobilePlayer /> : <SignupBanner />}</div>
      <BottomNav />
      {panel && (
        <div className={mobile.panelSheet}>
          <RightSidebar />
        </div>
      )}
      <Overlays />
    </div>
  );
}
