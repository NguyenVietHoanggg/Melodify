/** User uploads live in the PRIVATE "uploads" bucket; listeners get a short-lived signed URL. */
import { supabaseAdmin } from '../lib/supabase';
import type { MusicProvider } from './types';

const TTL_SECONDS = 3600;

export const uploadProvider: MusicProvider = {
  id: 'upload',
  async resolveStream(target) {
    const { data, error } = await supabaseAdmin.storage.from('uploads').createSignedUrl(target.storagePath!, TTL_SECONDS);
    if (error || !data) throw new Error(`Could not sign upload URL: ${error?.message}`);
    return { url: data.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 };
  },
};
