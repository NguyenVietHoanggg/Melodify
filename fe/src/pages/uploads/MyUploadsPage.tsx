/**
 * "Your Uploads" (/collection/uploads): the songs you published, with their status —
 * public/private, analysis progress (BPM & key appear when the background analysis finishes).
 */
import { useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import type { Track } from '@contracts';
import { useDeleteUpload, useUpdateUpload } from '@/api/mutations';
import { useMe, useMyUploads, type MyUpload } from '@/api/queries';
import { ActionBar, EntityBody, EntityHeader, MetaDot } from '@/components/entity/EntityHeader';
import { StickyBar } from '@/components/entity/StickyBar';
import entity from '@/components/entity/entity.module.css';
import { Icon } from '@/components/icons/Icon';
import { PageFooter } from '@/components/layout/PageFooter';
import { Cover } from '@/components/media/Cover';
import { Explicit, PlayButton } from '@/components/media/PlayButton';
import { useTrackMenu } from '@/components/tracks/useTrackMenu';
import { Button, IconButton } from '@/components/ui/Button';
import { Dialog, Spinner } from '@/components/ui/Dialog';
import { ContextMenu, DropdownMenu } from '@/components/ui/Menu';
import { BRAND } from '@/config/brand';
import { formatDuration, formatNumber } from '@/lib/format';
import { pause, playContext, resume } from '@/player/commands';
import { usePlayer } from '@/player/store';
import page from '../page.module.css';
import styles from './uploads.module.css';

const COLOR = '#1e3264';

function UploadRow({ item, index, onDelete }: { item: MyUpload; index: number; onDelete: (t: Track) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const menuOf = useTrackMenu();
  const update = useUpdateUpload();
  const { track, analysisStatus } = item;
  const isCurrent = usePlayer((s) => s.view?.current?.track?.id === track.id);
  const playing = usePlayer((s) => Boolean(s.view?.isPlaying));
  const play = () => {
    if (isCurrent) void (playing ? pause() : resume());
    else void playContext({ context: { type: 'collection', id: 'uploads' }, offset: { trackId: track.id } });
  };
  const isPublic = track.visibility === 'public';
  const entries = [
    { label: t('upload.edit'), icon: 'edit' as const, onSelect: () => navigate(`/uploads/${track.id}/edit`) },
    { label: isPublic ? t('menu.makePrivate') : t('menu.makePublic'), icon: (isPublic ? 'lock' : 'globe') as 'lock' | 'globe', onSelect: () => update.mutate({ id: track.id, visibility: isPublic ? 'private' : 'public' }) },
    { label: t('upload.delete'), icon: 'trash' as const, onSelect: () => onDelete(track) },
    { kind: 'separator' as const },
    ...menuOf(track),
  ];

  return (
    <ContextMenu entries={() => entries}>
      <div className={clsx(styles.row, isCurrent && styles.rowCurrent)} onDoubleClick={play}>
        <span className={styles.rowIndex}>{isCurrent && playing ? <Icon name="equalizer" size={14} /> : index + 1}</span>
        <div className={styles.rowMain}>
          <button type="button" className={styles.rowCover} onClick={play} aria-label={t('actions.playName', { name: track.title })}>
            <Cover imageUrl={track.album?.coverUrl} radius="sm" />
          </button>
          <div className={styles.rowText}>
            <Link to={`/track/${track.id}`} className={clsx(styles.rowTitle, 'ellipsis')}>{track.title}</Link>
            <span className={clsx(styles.rowSub, 'ellipsis')}>
              {track.explicit && <Explicit />} {track.artists.map((a) => a.name).join(', ')}
            </span>
          </div>
        </div>
        <span>
          <span className={styles.badge}>
            <Icon name={isPublic ? 'globe' : 'lock'} size={12} /> {isPublic ? t('upload.public') : t('upload.private')}
          </span>
        </span>
        <span className={styles.analysis}>
          {analysisStatus === 'pending' ? (
            <span className={styles.pending}><Spinner size={12} /> {t('upload.analyzing')}</span>
          ) : analysisStatus === 'failed' ? (
            <span className={clsx(styles.badge, styles.badgeWarn)}>{t('upload.analysisFailed')}</span>
          ) : (
            [track.features.bpm && `${Math.round(track.features.bpm)} BPM`, track.features.camelot].filter(Boolean).join(' • ')
          )}
        </span>
        <span className={styles.duration}>{formatDuration(track.durationMs)}</span>
        <span className={styles.rowActions}>
          <IconButton icon="edit" label={t('upload.edit')} onClick={() => navigate(`/uploads/${track.id}/edit`)} />
          <DropdownMenu entries={entries} trigger={<button type="button" className={styles.iconBtnLike} aria-label={t('actions.moreOptions', { name: track.title })}><Icon name="more" /></button>} />
        </span>
      </div>
    </ContextMenu>
  );
}

export function MyUploadsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const me = useMe();
  const { data, isLoading } = useMyUploads(Boolean(me));
  const remove = useDeleteUpload();
  const [deleting, setDeleting] = useState<Track | null>(null);

  if (!me) {
    return (
      <div className={page.empty}>
        <h2>{t('upload.myUploads')}</h2>
        <Link to="/login?continue=/collection/uploads"><Button variant="white">{t('nav.logIn')}</Button></Link>
      </div>
    );
  }
  const items = data?.items ?? [];
  const uri = 'melodify:collection:uploads';
  return (
    <div className={page.page}>
      <StickyBar color={COLOR}>
        {items.length > 0 && <PlayButton context={{ type: 'collection', id: 'uploads' }} uri={uri} name={t('upload.myUploads')} />}
        <span className={entity.stickyTitle}>{t('upload.myUploads')}</span>
      </StickyBar>
      <EntityHeader
        color={COLOR}
        cover={<Cover collection="uploads" radius="lg" />}
        label={t('entity.playlist')}
        title={t('upload.myUploads')}
        meta={
          <>
            <Link to={`/user/${me.id}`}><strong>{me.displayName}</strong></Link>
            <MetaDot />
            {t('entity.songs', { count: items.length, formatted: formatNumber(items.length, lang) })}
            <MetaDot />
            {t('upload.quota', { used: items.length, max: me.entitlements.uploadTracksLimit })}
          </>
        }
      />
      <EntityBody color={COLOR}>
        <ActionBar>
          {items.length > 0 && <PlayButton context={{ type: 'collection', id: 'uploads' }} uri={uri} name={t('upload.myUploads')} size="large" />}
          <Link to="/uploads/new">
            <Button variant="outline" icon="upload">{t('upload.uploadNew')}</Button>
          </Link>
          <Link to="/community">
            <Button variant="text">{t('community.title')}</Button>
          </Link>
        </ActionBar>
        {isLoading ? (
          <div className={page.centered}><Spinner /></div>
        ) : items.length ? (
          <div className={styles.list}>
            {items.map((item, i) => (
              <UploadRow key={item.track.id} item={item} index={i} onDelete={setDeleting} />
            ))}
          </div>
        ) : (
          <div className={page.empty}>
            <Icon name="upload" size={64} />
            <h2>{t('upload.emptyTitle')}</h2>
            <p className={page.muted}>{t('upload.emptyBody')}</p>
            <Link to="/uploads/new"><Button variant="white">{t('upload.uploadNew')}</Button></Link>
          </div>
        )}
      </EntityBody>
      <Dialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)} title={t('upload.deleteTitle')}>
        <p className={page.muted}>{t('upload.deleteBody', { title: deleting?.title ?? '', app: BRAND.name })}</p>
        <div className={styles.dialogActions}>
          <Button variant="text" onClick={() => setDeleting(null)}>{t('upload.cancel')}</Button>
          <Button variant="white" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}>
            {t('upload.delete')}
          </Button>
        </div>
      </Dialog>
      <PageFooter />
    </div>
  );
}
