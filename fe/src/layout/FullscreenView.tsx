import { useEffect } from 'react';
import { Cover } from '@/components/media/Cover';
import { ArtistLinks } from '@/components/media/Card';
import { imageOf, titleOf, usePlayer } from '@/player/store';
import { useUi } from '@/stores/ui';
import { NowPlayingBar } from './NowPlayingBar';
import styles from './fullscreen.module.css';

/** "Enter Full screen": huge artwork + title over a blurred backdrop, with the normal player controls. */
export function FullscreenView() {
  const open = useUi((s) => s.fullscreen);
  const setFullscreen = useUi((s) => s.setFullscreen);
  const item = usePlayer((s) => s.view?.current ?? null);
  const context = usePlayer((s) => s.view?.context ?? null);

  useEffect(() => {
    if (!open) return;
    void document.documentElement.requestFullscreen?.().catch(() => {});
    const onChange = () => !document.fullscreenElement && setFullscreen(false);
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) void document.exitFullscreen();
    };
  }, [open, setFullscreen]);

  if (!open) return null;
  const img = imageOf(item);
  return (
    <div className={styles.full}>
      {img && <img className={styles.backdrop} src={img} alt="" />}
      <header className={styles.top}>
        <span className={styles.context}>{context?.name}</span>
      </header>
      <div className={styles.body}>
        <div className={styles.cover}>
          <Cover imageUrl={img} radius="lg" eager />
        </div>
        <div className={styles.meta}>
          <h1 className={styles.title}>{titleOf(item)}</h1>
          <p className={styles.artists}>{item?.track ? <ArtistLinks artists={item.track.artists} /> : item?.episode?.show.title}</p>
        </div>
      </div>
      <div className={styles.controls}>
        <NowPlayingBar />
      </div>
    </div>
  );
}
