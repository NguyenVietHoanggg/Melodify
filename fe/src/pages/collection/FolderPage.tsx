/** A library folder (/folder/:id): the playlists you grouped inside it. */
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import type { Card, LibraryEntry } from '@contracts';
import { useLibrary, useMe } from '@/api/queries';
import { ActionBar, EntityBody, EntityHeader } from '@/components/entity/EntityHeader';
import { StickyBar } from '@/components/entity/StickyBar';
import entity from '@/components/entity/entity.module.css';
import { Icon } from '@/components/icons/Icon';
import { PageFooter } from '@/components/layout/PageFooter';
import { CardGrid } from '@/components/media/Shelf';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Dialog';
import { DropdownMenu } from '@/components/ui/Menu';
import { useFolders } from '@/layout/useFolders';
import { formatNumber } from '@/lib/format';
import page from '../page.module.css';

const toCard = (e: LibraryEntry): Card => ({
  type: e.type === 'collection' ? 'collection' : (e.type as Card['type']),
  id: e.type === 'collection' ? (e.collection ?? e.id) : e.id,
  name: e.name,
  uri: e.uri,
  imageUrl: e.imageUrl,
  mosaic: e.mosaic,
  mixCover: e.mixCover,
  ownerName: e.ownerName,
  artists: e.artists,
  releaseType: e.releaseType,
  publisher: e.publisher,
});

export function FolderPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const me = useMe();
  const navigate = useNavigate();
  const folders = useFolders();
  const { data, isLoading } = useLibrary(null, 'recents', '', Boolean(me));
  if (!me) {
    return (
      <div className={page.empty}>
        <Link to="/login"><Button variant="white">{t('nav.logIn')}</Button></Link>
      </div>
    );
  }
  if (isLoading) return <div className={page.centered}><Spinner /></div>;
  const folder = data?.items.find((e) => e.type === 'folder' && e.id === id);
  const items = (data?.items ?? []).filter((e) => e.folderId === id && e.type !== 'folder');
  if (!folder) {
    return (
      <div className={page.empty}>
        <h2>{t('errors.folder_not_found')}</h2>
        <Link to="/"><Button variant="white">{t('notFound.home')}</Button></Link>
      </div>
    );
  }
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  return (
    <div className={page.page}>
      <StickyBar color="#535353">
        <span className={entity.stickyTitle}>{folder.name}</span>
      </StickyBar>
      <EntityHeader
        color="#535353"
        cover={
          <div style={{ display: 'grid', placeItems: 'center', width: '100%', aspectRatio: '1', background: '#282828', borderRadius: 6 }}>
            <Icon name="folder" size={72} />
          </div>
        }
        label={t('folder.label')}
        title={folder.name}
        meta={t('folder.items', { count: items.length, formatted: formatNumber(items.length, lang) })}
      />
      <EntityBody color="#535353">
        <ActionBar>
          <DropdownMenu
            entries={[
              { label: t('menu.rename'), icon: 'edit', onSelect: () => folders.rename(folder) },
              { label: t('folder.deleteMenu'), icon: 'trash', danger: true, onSelect: () => folders.remove(folder, () => navigate('/')) },
            ]}
            trigger={
              <button type="button" className={entity.bigIcon} aria-label={t('actions.moreOptions', { name: folder.name })}>
                <Icon name="more" size={32} />
              </button>
            }
          />
        </ActionBar>
        <div className={page.content}>
          {items.length ? (
            <CardGrid items={items.map(toCard)} />
          ) : (
            <div className={page.empty}>
              <Icon name="folder" size={48} />
              <h2>{t('folder.emptyTitle')}</h2>
              <p className={page.muted}>{t('folder.emptyBody')}</p>
            </div>
          )}
        </div>
      </EntityBody>
      <PageFooter />
    </div>
  );
}
