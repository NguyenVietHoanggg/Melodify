/**
 * "Install app": Chrome/Edge fire `beforeinstallprompt` when the site is installable (manifest + icons).
 * We keep that event so the Download page / top bar can show the native install dialog on demand.
 */
import { create } from 'zustand';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const usePwa = create<{ prompt: InstallPromptEvent | null; installed: boolean }>()(() => ({
  prompt: null,
  installed: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
}));

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // keep it for later instead of Chrome's mini-infobar
  usePwa.setState({ prompt: e as InstallPromptEvent });
});
window.addEventListener('appinstalled', () => usePwa.setState({ prompt: null, installed: true }));

export async function installApp(): Promise<boolean> {
  const p = usePwa.getState().prompt;
  if (!p) return false;
  await p.prompt();
  const { outcome } = await p.userChoice;
  usePwa.setState({ prompt: null, installed: outcome === 'accepted' });
  return outcome === 'accepted';
}
