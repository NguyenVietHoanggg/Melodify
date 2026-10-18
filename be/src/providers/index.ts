import { audiusProvider } from './audius';
import type { MusicProvider } from './types';
import { uploadProvider } from './upload';

/** Registry of music sources. Adding a licensed catalog later = one more line here. */
const providers: Record<string, MusicProvider> = {
  [audiusProvider.id]: audiusProvider,
  [uploadProvider.id]: uploadProvider,
};

export function getProvider(id: string): MusicProvider | undefined {
  return providers[id];
}
