/**
 * Miniplayer: a small always-on-top window using the Document Picture-in-Picture API (Chrome 116+),
 * the same technique Spotify's web player uses. We render a React tree into the PiP window and copy
 * the page's stylesheets into it.
 */
import { createRoot, type Root } from 'react-dom/client';
import i18n from '@/i18n';
import { toast } from '@/stores/toast';
import { Icon } from '@/components/icons/Icon';
import * as commands from './commands';
import { imageOf, titleOf, usePlayer } from './store';

interface DocumentPictureInPicture {
  requestWindow(opts: { width: number; height: number }): Promise<Window>;
  window: Window | null;
}

let root: Root | null = null;

function Mini() {
  const view = usePlayer((s) => s.view);
  const item = view?.current;
  const artists = item?.track?.artists.map((a) => a.name).join(', ') ?? item?.episode?.show.title ?? '';
  const img = imageOf(item);
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: '#121212', color: '#fff', fontFamily: 'var(--font-sans)' }}>
      {img && <img src={img} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }} />}
      <div style={{ position: 'relative', padding: 16, background: 'linear-gradient(transparent, rgba(0,0,0,.85))' }}>
        <div style={{ fontWeight: 700, fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titleOf(item) || '—'}</div>
        <div style={{ fontSize: 14, color: '#b3b3b3', marginBottom: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artists}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
          <button type="button" onClick={() => void commands.previous()} style={{ color: '#fff' }} aria-label="Previous">
            <Icon name="previous" size={20} />
          </button>
          <button type="button" onClick={() => void commands.togglePlay()} aria-label="Play/Pause" style={{ width: 44, height: 44, borderRadius: '50%', background: '#fff', color: '#000', display: 'grid', placeItems: 'center' }}>
            <Icon name={view?.isPlaying ? 'pause' : 'play'} size={20} />
          </button>
          <button type="button" onClick={() => void commands.next('skipped')} style={{ color: '#fff' }} aria-label="Next">
            <Icon name="next" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

export async function openMiniplayer() {
  const dpip = (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture;
  if (!dpip) {
    toast(i18n.language === 'vi' ? 'Trình duyệt này chưa hỗ trợ trình phát thu nhỏ (cần Chrome/Edge mới).' : 'Your browser does not support the Miniplayer yet (use a recent Chrome/Edge).');
    return;
  }
  if (dpip.window) {
    dpip.window.focus();
    return;
  }
  const pip = await dpip.requestWindow({ width: 340, height: 340 });
  for (const sheet of [...document.styleSheets]) {
    try {
      const style = pip.document.createElement('style');
      style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n');
      pip.document.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = pip.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        pip.document.head.appendChild(link);
      }
    }
  }
  const mount = pip.document.createElement('div');
  pip.document.body.style.margin = '0';
  pip.document.body.appendChild(mount);
  root = createRoot(mount);
  root.render(<Mini />);
  pip.addEventListener('pagehide', () => {
    root?.unmount();
    root = null;
  });
}
