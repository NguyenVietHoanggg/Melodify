import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Playlist } from '@contracts';
import { useUpdatePlaylist } from '@/api/mutations';
import { Icon } from '@/components/icons/Icon';
import { Cover } from '@/components/media/Cover';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FieldError } from '@/components/ui/Form';
import { BRAND } from '@/config/brand';
import { errorMessage, post } from '@/lib/api';
import { imageError, textError } from '@/lib/validate';
import { toast } from '@/stores/toast';
import styles from './playlist.module.css';

/**
 * "Edit details": name, description, cover image. The image goes straight from the browser to storage
 * through a signed upload URL issued by the backend (the file never passes through our server).
 */
export function EditPlaylistDialog({ playlist, open, onOpenChange }: { playlist: Playlist; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const update = useUpdatePlaylist();
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description ?? '');
  const [preview, setPreview] = useState<string | null>(null);
  const [coverPath, setCoverPath] = useState<string | null | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [tried, setTried] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const nameError = name.trim() ? textError(name, { max: 100 }) : t('validation.playlistName');
  const descriptionError = textError(description, { max: 300, required: false });

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const problem = imageError(f);
    if (problem) return toast(problem);
    setPreview(URL.createObjectURL(f));
    setUploading(true);
    try {
      const { uploadUrl, path } = await post<{ uploadUrl: string; path: string }>(`/playlists/${playlist.id}/cover-upload`, { contentType: f.type });
      const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': f.type }, body: f });
      if (!res.ok) throw new Error('upload failed');
      setCoverPath(path);
    } catch (err) {
      toast(errorMessage(err));
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    setTried(true);
    if (nameError || descriptionError) return;
    update.mutate(
      { id: playlist.id, name: name.trim(), description: description.trim() || null, ...(coverPath !== undefined && { coverPath }) },
      { onSuccess: () => onOpenChange(false), onError: (err) => toast(errorMessage(err)) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('entity.editDetails')} className={styles.editDialog}>
      <div className={styles.editGrid}>
        <button type="button" className={styles.editCover} onClick={() => file.current?.click()} aria-label={t('entity.choosePhoto')}>
          <Cover imageUrl={preview ?? (coverPath === null ? null : playlist.coverUrl)} mosaic={playlist.mosaic} mixCover={playlist.mixCover} radius="sm" />
          <span className={styles.editCoverHover}>
            <Icon name="edit" size={48} />
            <span>{t('entity.choosePhoto')}</span>
          </span>
        </button>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = ''; // picking the same file again still triggers onChange
          }}
        />
        <label className={styles.field}>
          <span>{t('entity.name')}</span>
          <input value={name} maxLength={100} aria-invalid={tried && Boolean(nameError)} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={`${styles.field} ${styles.fieldDesc}`}>
          <span>{t('entity.description')}</span>
          <textarea value={description} maxLength={300} placeholder={t('entity.description')} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>
      {tried && <FieldError>{nameError || descriptionError}</FieldError>}
      <div className={styles.editFooter}>
        <Button variant="white" onClick={save} disabled={uploading || update.isPending}>
          {t('entity.save')}
        </Button>
      </div>
      <p className={styles.disclaimer}>{t('entity.editDisclaimer', { app: BRAND.name })}</p>
    </Dialog>
  );
}
