/**
 * Uploads go straight from the browser to Supabase Storage using short-lived signed URLs:
 *   1. backend checks permissions & creates a signed upload URL for a path it chooses;
 *   2. browser PUTs the file to that URL (bytes never pass through our server);
 *   3. browser tells the backend "done", the backend verifies the path and uses the file.
 */
import crypto from 'node:crypto';
import { headerColorFromUrls } from '../../lib/colors';
import { badRequest, forbidden } from '../../lib/http';
import { logger } from '../../lib/logger';
import { supabaseAdmin } from '../../lib/supabase';

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export type ImageKind = 'playlist-covers' | 'avatars' | 'upload-covers';

export async function createImageUpload(kind: ImageKind, ownerId: string, contentType: string) {
  const ext = IMAGE_TYPES[contentType];
  if (!ext) throw badRequest('unsupported_image_type');
  const path = `${kind}/${ownerId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabaseAdmin.storage.from('images').createSignedUploadUrl(path);
  if (error || !data) throw badRequest('upload_unavailable', error?.message);
  return { uploadUrl: data.signedUrl, path, maxBytes: 5 * 1024 * 1024 };
}

/**
 * Delete an image we stored earlier (a replaced avatar or cover, a deleted playlist's cover…) so old files
 * don't pile up in Storage. Only touches files of this owner in our own bucket — anything else is ignored.
 */
export async function removeOwnedImage(kind: ImageKind, ownerId: string, url: string | null | undefined) {
  const marker = '/storage/v1/object/public/images/';
  const at = url?.indexOf(marker) ?? -1;
  if (!url || at < 0) return;
  const path = decodeURIComponent(url.slice(at + marker.length).split('?')[0]!);
  if (!path.startsWith(`${kind}/${ownerId}/`) || path.includes('..')) return;
  const { error } = await supabaseAdmin.storage.from('images').remove([path]);
  if (error) logger.warn({ err: error, path }, 'image cleanup failed');
}

/** Validate that the uploaded path belongs to this owner, then return its public URL + header color. */
export async function finalizeImage(kind: ImageKind, ownerId: string, path: string) {
  if (!path.startsWith(`${kind}/${ownerId}/`) || path.includes('..')) throw forbidden('invalid_upload_path');
  const url = supabaseAdmin.storage.from('images').getPublicUrl(path).data.publicUrl;
  const color = await headerColorFromUrls([url]);
  if (!color) throw badRequest('image_not_found');
  return { url, color };
}
