/**
 * Library folders: create (asking for a name), rename, delete (with confirmation) and moving playlists in
 * and out — shared by the sidebar menus, the "+ Create" menu and the folder page.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LibraryEntry } from '@contracts';
import { useLibrary, useMe } from '@/api/queries';
import { del, patch, post, put } from '@/lib/api';
import { useDialogs } from '@/stores/dialogs';
import { toast } from '@/stores/toast';

const FOLDER_NAME_MAX = 100;

// Dialogs opened from a menu wait one tick, so the closing menu doesn't steal their focus.
const later = (fn: () => void) => setTimeout(fn, 0);

export function useFolders() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const me = useMe();
  const all = useLibrary(null, 'alpha', '', Boolean(me));
  const folders = (all.data?.items ?? []).filter((e) => e.type === 'folder');
  const refresh = () => qc.invalidateQueries({ queryKey: ['library'] });

  const create = (then?: (folder: { id: string; name: string }) => void) =>
    later(() =>
      useDialogs.getState().openTextPrompt({
        title: t('folder.createTitle'),
        label: t('folder.nameLabel'),
        initial: t('folder.newFolder'),
        max: FOLDER_NAME_MAX,
        confirmLabel: t('folder.create'),
        onSubmit: async (name) => {
          const folder = await post<{ id: string; name: string }>('/me/library/folders', { name });
          await refresh();
          then?.(folder);
        },
      }),
    );

  const rename = (folder: { id: string; name: string }) =>
    later(() =>
      useDialogs.getState().openTextPrompt({
        title: t('folder.renameTitle'),
        label: t('folder.nameLabel'),
        initial: folder.name,
        max: FOLDER_NAME_MAX,
        confirmLabel: t('folder.save'),
        onSubmit: async (name) => {
          await patch(`/me/library/folders/${folder.id}`, { name });
          await refresh();
        },
      }),
    );

  const remove = (folder: { id: string; name: string }, after?: () => void) =>
    later(() =>
      useDialogs.getState().openConfirm({
        title: t('folder.deleteTitle', { name: folder.name }),
        body: t('folder.deleteBody'),
        confirmLabel: t('menu.delete'),
        danger: true,
        onConfirm: () => void del(`/me/library/folders/${folder.id}`).then(async () => {
          await refresh();
          after?.();
        }),
      }),
    );

  const move = (entry: LibraryEntry, folder: { id: string; name: string } | null) =>
    void put('/me/library/folder', { type: entry.type, id: entry.id, folderId: folder?.id ?? null }).then(async () => {
      await refresh();
      toast(folder ? t('folder.moved', { name: folder.name }) : t('folder.removed'));
    });

  return { folders, create, rename, remove, move };
}
