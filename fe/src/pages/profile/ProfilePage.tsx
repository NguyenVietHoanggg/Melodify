/**
 * Public profile (/user/:id) — header with the round photo, "N Public Playlists • N Followers • N Following",
 * a Follow button (or Edit for yourself) and the sections the owner allows (privacy settings).
 * Also renders the "Show all" pages: /user/:id/:list.
 */
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import type { Me, Section, UserProfile } from '@contracts';
import { useFollowUser } from '@/api/mutations';
import { qk, useMe, useProfile, useProfileList } from '@/api/queries';
import { ActionBar, EntityBody, EntityHeader, MetaDot } from '@/components/entity/EntityHeader';
import { StickyBar } from '@/components/entity/StickyBar';
import entity from '@/components/entity/entity.module.css';
import { Icon } from '@/components/icons/Icon';
import { PageFooter } from '@/components/layout/PageFooter';
import { Cover } from '@/components/media/Cover';
import { CardGrid, Shelf } from '@/components/media/Shelf';
import { TrackList } from '@/components/tracks/TrackList';
import { Button } from '@/components/ui/Button';
import { Dialog, Spinner } from '@/components/ui/Dialog';
import { DropdownMenu, type MenuEntry } from '@/components/ui/Menu';
import { BRAND } from '@/config/brand';
import { del, errorMessage, patch, post, put } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { IMAGE_TYPES, putFile } from '@/lib/upload';
import { toast } from '@/stores/toast';
import { FieldError } from '@/components/ui/Form';
import { imageError, textError } from '@/lib/validate';
import page from '../page.module.css';
import styles from './profile.module.css';

function EditProfileDialog({ me, open, onOpenChange }: { me: Me; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState(me.displayName);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const refresh = (next: Me) => {
    qc.setQueryData(qk.session, { me: next });
    void qc.invalidateQueries({ queryKey: ['profile', me.id] });
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast(errorMessage(err));
    }
    setBusy(false);
  };

  // Photo: signed upload URL → browser uploads to storage → backend checks the path and saves it.
  const onFile = (f: File | undefined) => {
    if (!f) return;
    const problem = imageError(f);
    if (problem) return toast(problem);
    setPreview(URL.createObjectURL(f));
    void run(async () => {
      try {
        const { uploadUrl, path } = await post<{ uploadUrl: string; path: string }>('/me/avatar-upload', { contentType: f.type });
        await putFile(uploadUrl, f);
        refresh(await put<Me>('/me/avatar', { path }));
      } catch (err) {
        setPreview(null);
        throw err;
      }
    });
  };

  const removePhoto = () => {
    setPreview(null);
    void run(async () => refresh(await del<Me>('/me/avatar')));
  };

  const nameError = textError(name, { max: 60 });
  const save = () => {
    setTried(true);
    if (nameError) return;
    void run(async () => {
      const value = name.trim();
      if (value !== me.displayName) refresh(await patch<Me>('/me', { displayName: value }));
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('profile.profileDetails')} className={styles.editDialog}>
      <div className={styles.editGrid}>
        <div className={styles.editAvatarWrap}>
          <button type="button" className={styles.editAvatar} onClick={() => input.current?.click()} aria-label={t('profile.chooseAvatar')}>
            <Cover imageUrl={preview ?? me.avatarUrl} round fallbackIcon="user" />
            <span className={styles.editAvatarHover}>
              <Icon name="edit" size={40} />
              <span>{t('profile.chooseAvatar')}</span>
            </span>
          </button>
          {(me.avatarUrl || preview) && (
            <button type="button" className={styles.removePhoto} onClick={removePhoto} disabled={busy}>
              {t('profile.removeAvatar')}
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          hidden
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <div className={styles.editFields}>
          <label className={styles.nameField}>
            <span>{t('entity.name')}</span>
            <input value={name} maxLength={60} aria-invalid={tried && Boolean(nameError)} onChange={(e) => setName(e.target.value)} />
          </label>
          {tried && <FieldError>{nameError}</FieldError>}
          <div className={styles.editFooter}>
            <Button variant="white" disabled={busy} onClick={save}>
              {t('entity.save')}
            </Button>
          </div>
        </div>
      </div>
      <p className={styles.disclaimer}>{t('entity.editDisclaimer', { app: BRAND.name })}</p>
    </Dialog>
  );
}

function SectionView({ section, profile }: { section: Section; profile: UserProfile }) {
  const { t } = useTranslation();
  const title = (
    <>
      {t(section.titleKey === 'profile.publicPlaylists' ? 'profile.publicPlaylistsTitle' : section.titleKey, section.titleParams)}
    </>
  );
  if (section.layout === 'tracks') {
    return (
      <section className={styles.trackSection}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>{section.seeAllPath ? <Link to={section.seeAllPath}>{title}</Link> : title}</h2>
            {section.subtitleKey && <p className={styles.sectionSub}>{t(section.subtitleKey)}</p>}
          </div>
          {section.seeAllPath && <Link to={section.seeAllPath} className={styles.showAll}>{t('home.showAll')}</Link>}
        </div>
        <TrackList
          tracks={section.tracks ?? []}
          context={{ type: section.id === 'uploads' ? 'uploads' : 'track', id: null, uri: `melodify:user:${profile.id}:${section.id}` }}
          columns={{ cover: true, album: section.id !== 'uploads' }}
          rowContext
          showHeader={false}
        />
      </section>
    );
  }
  return (
    <div className={styles.shelfWrap}>
      {section.subtitleKey && <p className={clsx(styles.sectionSub, styles.shelfSub)}>{t(section.subtitleKey)}</p>}
      <Shelf title={title} seeAllPath={section.seeAllPath} items={section.items} />
    </div>
  );
}

export function ProfilePage() {
  const { id = '', list } = useParams();
  if (list) return <ProfileListPage id={id} list={list} />;
  return <ProfileMain id={id} />;
}

function ProfileMain({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const me = useMe();
  const { data: p, isLoading } = useProfile(id);
  const follow = useFollowUser();
  const [editing, setEditing] = useState(false);

  if (isLoading) return <div className={page.centered}><Spinner /></div>;
  if (!p) {
    return (
      <div className={page.empty}>
        <h2>{t('notFound.title')}</h2>
        <Link to="/"><Button variant="white">{t('notFound.home')}</Button></Link>
      </div>
    );
  }
  const copyLink = () => void navigator.clipboard.writeText(`${location.origin}/user/${p.id}`).then(() => toast(t('actions.linkCopied')));
  const menu: MenuEntry[] = [
    ...(p.isMe && me ? [{ label: t('profile.editProfile'), icon: 'edit', onSelect: () => setEditing(true) } as MenuEntry] : []),
    { label: t('profile.copyLink'), icon: 'link', onSelect: copyLink },
  ];
  const n = (x: number) => formatNumber(x, lang);

  return (
    <div className={page.page}>
      <StickyBar color={p.color}>
        <span className={entity.stickyTitle}>{p.displayName}</span>
      </StickyBar>
      <EntityHeader
        color={p.color}
        round
        cover={
          p.isMe ? (
            <button type="button" className={styles.headerAvatar} onClick={() => setEditing(true)} aria-label={t('profile.chooseAvatar')}>
              <Cover imageUrl={p.avatarUrl} round fallbackIcon="user" eager />
              <span className={styles.editAvatarHover}>
                <Icon name="edit" size={48} />
                <span>{t('profile.chooseAvatar')}</span>
              </span>
            </button>
          ) : (
            <Cover imageUrl={p.avatarUrl} round fallbackIcon="user" eager />
          )
        }
        label={t('profile.label')}
        title={p.displayName}
        onTitleClick={p.isMe ? () => setEditing(true) : undefined}
        meta={
          <>
            {p.publicPlaylistsCount > 0 && (
              <>
                <Link to={`/user/${p.id}/playlists`}>{t('profile.publicPlaylists', { count: p.publicPlaylistsCount, formatted: n(p.publicPlaylistsCount) })}</Link>
                <MetaDot />
              </>
            )}
            <Link to={`/user/${p.id}/followers`}>{t('profile.followers', { count: p.followersCount, formatted: n(p.followersCount) })}</Link>
            <MetaDot />
            <Link to={`/user/${p.id}/following`}>{t('profile.followingCount', { formatted: n(p.followingCount) })}</Link>
          </>
        }
      />
      <EntityBody color={p.color}>
        <ActionBar>
          {!p.isMe && me && (
            <Button variant="outline" size="sm" className={styles.follow} onClick={() => follow.mutate({ id: p.id, follow: !p.isFollowing })}>
              {p.isFollowing ? t('actions.following') : t('actions.follow')}
            </Button>
          )}
          <DropdownMenu
            entries={menu}
            trigger={
              <button type="button" className={entity.bigIcon} aria-label={t('actions.moreOptions', { name: p.displayName })}>
                <Icon name="more" size={32} />
              </button>
            }
          />
        </ActionBar>
        <div className={page.sections}>
          {p.sections.length ? (
            p.sections.map((s) => <SectionView key={s.id} section={s} profile={p} />)
          ) : (
            <p className={clsx(page.muted, styles.nothing)}>{t('profile.nothingYet')}</p>
          )}
        </div>
      </EntityBody>
      <PageFooter />
      {p.isMe && me && editing && <EditProfileDialog me={me} open={editing} onOpenChange={setEditing} />}
    </div>
  );
}

function ProfileListPage({ id, list }: { id: string; list: string }) {
  const { t } = useTranslation();
  const { data: profile } = useProfile(id);
  const { data, isLoading, error } = useProfileList(id, list);
  if (isLoading) return <div className={page.centered}><Spinner /></div>;
  if (error || !data) {
    return (
      <div className={page.empty}>
        <h2>{t('errors.private_profile_section')}</h2>
        <Link to={`/user/${id}`}><Button variant="white">{t('nav.back')}</Button></Link>
      </div>
    );
  }
  const title = t(data.titleKey === 'profile.publicPlaylists' ? 'profile.publicPlaylistsTitle' : data.titleKey);
  return (
    <div className={page.page}>
      <div className={page.content}>
        <div className={styles.listHead}>
          {profile && (
            <Link to={`/user/${id}`} className={styles.listOwner}>
              {profile.displayName}
            </Link>
          )}
          <h1 className={styles.listTitle}>{title}</h1>
          {data.subtitleKey && <p className={styles.sectionSub}>{t(data.subtitleKey)}</p>}
        </div>
        {data.layout === 'tracks' ? (
          <TrackList tracks={data.tracks ?? []} context={{ type: 'track', id: null, uri: `melodify:user:${id}:${list}` }} columns={{ cover: true, album: true }} rowContext stickyTop={0} />
        ) : (
          <CardGrid items={data.items} />
        )}
      </div>
      <PageFooter />
    </div>
  );
}
