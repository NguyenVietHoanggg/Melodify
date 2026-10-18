/**
 * Upload studio: /uploads/new (publish a song) and /uploads/:id/edit (change its details).
 *
 *   1. pick a file → POST /uploads (checks type, size, quota) → signed URL → the browser uploads it
 *      straight to storage with a progress bar;
 *   2. fill in the details while it uploads (title, artist, genre, moods, cover, lyrics, visibility);
 *   3. Publish → POST /uploads/:id/complete. The backend reads the ID3 tags and analyses the audio
 *      (BPM, key, energy) in the background — My Uploads shows the result when it's ready.
 */
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import type { Track } from '@contracts';
import { useDeleteUpload, useUpdateUpload, type UploadMeta } from '@/api/mutations';
import { useMe, useMyUploads, useTrack, useUploadOptions } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { PageFooter } from '@/components/layout/PageFooter';
import { Cover } from '@/components/media/Cover';
import { Button } from '@/components/ui/Button';
import { Chip, Dialog, Spinner } from '@/components/ui/Dialog';
import { Checkbox, RadioGroup, SelectField, TextArea, TextField } from '@/components/ui/Form';
import { BRAND } from '@/config/brand';
import { errorMessage, get, post } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { IMAGE_TYPES, putFile } from '@/lib/upload';
import { imageError, textError } from '@/lib/validate';
import { toast } from '@/stores/toast';
import page from '../page.module.css';
import styles from './uploads.module.css';

const EXT_TYPES: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', aac: 'audio/aac', m4a: 'audio/mp4' };

/** Browsers sometimes report an empty type (e.g. .flac on Windows): fall back to the extension. */
const audioTypeOf = (f: File) => f.type || EXT_TYPES[f.name.split('.').pop()?.toLowerCase() ?? ''] || '';

type LyricsResponse = { kind: 'synced' | 'plain' | 'none'; lines: { t?: number; text: string }[] };

/** Rebuild editable LRC text from synced lines ("[01:02.50] text"). */
function linesToText(l: LyricsResponse): string {
  if (l.kind === 'none') return '';
  if (l.kind === 'plain') return l.lines.map((x) => x.text).join('\n');
  return l.lines
    .map((x) => {
      const ms = x.t ?? 0;
      const m = Math.floor(ms / 60000);
      const s = ((ms % 60000) / 1000).toFixed(2).padStart(5, '0');
      return `[${String(m).padStart(2, '0')}:${s}]${x.text}`;
    })
    .join('\n');
}

interface FormState {
  title: string;
  artistName: string;
  genre: string;
  moods: string[];
  visibility: 'public' | 'private';
  explicit: boolean;
  lyrics: string;
}

export function UploadPage() {
  const { id } = useParams();
  return id ? <EditUpload id={id} /> : <NewUpload />;
}

function DetailsForm({
  form, setForm, cover, onCover, coverBusy, showArtist = true,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  cover: string | null;
  onCover: (f: File) => void;
  coverBusy: boolean;
  showArtist?: boolean;
}) {
  const { t } = useTranslation();
  const options = useUploadOptions();
  const coverInput = useRef<HTMLInputElement>(null);
  const [titleTouched, setTitleTouched] = useState(false);
  const titleError = titleTouched ? (form.title.trim() ? textError(form.title, { max: 200 }) : t('validation.trackTitle')) : '';
  const artistError = textError(form.artistName, { max: 80, required: false });
  const toggleMood = (m: string) =>
    setForm({ ...form, moods: form.moods.includes(m) ? form.moods.filter((x) => x !== m) : form.moods.length < 3 ? [...form.moods, m] : form.moods });

  return (
    <div className={styles.details}>
      <div className={styles.coverCol}>
        <button type="button" className={styles.coverPick} onClick={() => coverInput.current?.click()} aria-label={t('upload.cover')}>
          <Cover imageUrl={cover} radius="lg" fallbackIcon="image" />
          <span className={styles.coverHover}>
            {coverBusy ? <Spinner /> : <Icon name="edit" size={40} />}
            <span>{t('entity.choosePhoto')}</span>
          </span>
        </button>
        <p className={styles.hint}>{t('upload.coverHint')}</p>
        <input
          ref={coverInput}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onCover(f);
            e.target.value = '';
          }}
        />
      </div>
      <div className={styles.fields}>
        <TextField
          label={t('upload.trackTitle')}
          value={form.title}
          maxLength={200}
          error={titleError}
          onBlur={() => setTitleTouched(true)}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        {showArtist && (
          <TextField
            label={t('upload.artistName')}
            hint={t('upload.artistHint')}
            value={form.artistName}
            maxLength={80}
            error={artistError}
            onChange={(e) => setForm({ ...form, artistName: e.target.value })}
          />
        )}
        <SelectField
          label={t('upload.genre')}
          value={form.genre}
          onChange={(e) => setForm({ ...form, genre: e.target.value })}
          options={[{ value: '', label: t('upload.noGenre') }, ...(options.data?.genres ?? []).map((g) => ({ value: g, label: t(`genres.${g}`, { defaultValue: g }) }))]}
        />
        <div className={styles.moods}>
          <span className={styles.label}>{t('upload.moods')}</span>
          <div className={styles.chips}>
            {(options.data?.moods ?? []).map((m) => (
              <Chip key={m} selected={form.moods.includes(m)} onClick={() => toggleMood(m)}>
                {t(`moods.${m}`, { defaultValue: m })}
              </Chip>
            ))}
          </div>
        </div>
        <div className={styles.moods}>
          <span className={styles.label}>{t('upload.visibility')}</span>
          <RadioGroup
            name="visibility"
            className={styles.visibility}
            value={form.visibility}
            onChange={(v) => setForm({ ...form, visibility: v })}
            options={[
              { value: 'public', label: <><Icon name="globe" size={14} /> {t('upload.public')}</>, hint: t('upload.publicHint') },
              { value: 'private', label: <><Icon name="lock" size={14} /> {t('upload.private')}</>, hint: t('upload.privateHint') },
            ]}
          />
        </div>
        <Checkbox checked={form.explicit} onChange={(v) => setForm({ ...form, explicit: v })}>
          {t('upload.explicit')}
        </Checkbox>
        <TextArea
          label={t('upload.lyrics')}
          hint={t('upload.lyricsHint')}
          value={form.lyrics}
          rows={8}
          maxLength={20000}
          placeholder={'[00:12.00] …'}
          onChange={(e) => setForm({ ...form, lyrics: e.target.value })}
        />
      </div>
    </div>
  );
}

/** Uploads a cover image for an upload and returns its storage path. */
function useCoverUpload() {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (f: File) => {
    const problem = imageError(f);
    if (problem) return toast(problem);
    setPreview(URL.createObjectURL(f));
    setBusy(true);
    try {
      const r = await post<{ uploadUrl: string; path: string }>('/uploads/cover-upload', { contentType: f.type });
      await putFile(r.uploadUrl, f);
      setPath(r.path);
    } catch (err) {
      setPreview(null);
      toast(errorMessage(err));
    }
    setBusy(false);
  };
  return { preview, path, busy, upload };
}

function NewUpload() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const mine = useMyUploads(Boolean(me));
  const cover = useCoverUpload();
  const [file, setFile] = useState<File | null>(null);
  const [slot, setSlot] = useState<{ uploadId: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>({ title: '', artistName: '', genre: '', moods: [], visibility: 'public', explicit: false, lyrics: '' });
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => abort.current?.abort(), []);

  if (!me) {
    return (
      <div className={page.empty}>
        <h2>{t('upload.title')}</h2>
        <Link to="/login?continue=/uploads/new"><Button variant="white">{t('nav.logIn')}</Button></Link>
      </div>
    );
  }
  const max = me.entitlements.uploadTracksLimit;
  const used = mine.data?.items.length ?? 0;
  const maxMb = me.entitlements.uploadMaxMb;

  const start = async (f: File) => {
    const type = audioTypeOf(f);
    if (!EXT_TYPES[f.name.split('.').pop()?.toLowerCase() ?? ''] && !type.startsWith('audio/')) return setUploadError(t('errors.unsupported_audio_type'));
    if (f.size > maxMb * 1024 * 1024) return setUploadError(`${t('errors.file_too_large')} (${maxMb} MB)`);
    abort.current?.abort();
    abort.current = new AbortController();
    setFile(f);
    setUploadError('');
    setProgress(0);
    setSlot(null);
    setForm((prev) => ({ ...prev, title: prev.title || f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() }));
    try {
      const r = await post<{ uploadId: string; uploadUrl: string }>('/uploads', { fileName: f.name, size: f.size, mimeType: type });
      await putFile(r.uploadUrl, new File([f], f.name, { type }), setProgress, abort.current.signal);
      setProgress(1);
      setSlot({ uploadId: r.uploadId });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setUploadError(errorMessage(err));
      setFile(null);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) void start(f);
  };

  const publish = async () => {
    if (!slot) return;
    setBusy(true);
    try {
      const meta: UploadMeta = {
        title: form.title.trim(),
        artistName: form.artistName.trim() || undefined,
        genre: form.genre || null,
        moods: form.moods,
        visibility: form.visibility,
        explicit: form.explicit,
        lyrics: form.lyrics.trim() || null,
        coverPath: cover.path,
      };
      await post<Track>(`/uploads/${slot.uploadId}/complete`, meta);
      for (const key of ['my-uploads', 'library', 'community']) void qc.invalidateQueries({ queryKey: [key] });
      toast(t('upload.published'));
      navigate('/collection/uploads');
    } catch (err) {
      toast(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className={page.page}>
      <div className={styles.studio}>
        <header className={styles.head}>
          <h1>{t('upload.title')}</h1>
          <p>{t('upload.subtitle')}</p>
          <p className={styles.quota}>{t('upload.quota', { used, max })}</p>
        </header>

        {!file ? (
          <div
            className={clsx(styles.drop, dragging && styles.dropActive)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <Icon name="upload" size={48} />
            <p className={styles.dropTitle}>{t('upload.drop')}</p>
            <Button variant="white" onClick={() => input.current?.click()} disabled={used >= max}>
              {t('upload.choose')}
            </Button>
            <p className={styles.hint}>{t('upload.formats', { mb: maxMb })}</p>
            {used >= max && <p className={styles.error}>{t('errors.upload_limit_reached')}</p>}
            {uploadError && <p className={styles.error}>{uploadError}</p>}
            <input
              ref={input}
              type="file"
              accept="audio/*,.mp3,.wav,.flac,.ogg,.aac,.m4a"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void start(f);
                e.target.value = '';
              }}
            />
          </div>
        ) : (
          <div className={styles.fileCard}>
            <Icon name="note" size={24} />
            <div className={styles.fileInfo}>
              <strong className="ellipsis">{file.name}</strong>
              <span className={styles.hint}>
                {(file.size / 1024 / 1024).toFixed(1)} MB • {progress < 1 ? t('upload.uploading', { pct: Math.round(progress * 100) }) : t('upload.uploaded')}
              </span>
              <span className={styles.bar}>
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </span>
            </div>
            <Button
              variant="text"
              size="sm"
              onClick={() => {
                abort.current?.abort();
                setFile(null);
                setSlot(null);
              }}
            >
              {t('upload.chooseAnother')}
            </Button>
          </div>
        )}

        {file && (
          <>
            <h2 className={styles.sectionTitle}>{t('upload.details')}</h2>
            <DetailsForm form={form} setForm={setForm} cover={cover.preview} onCover={(f) => void cover.upload(f)} coverBusy={cover.busy} />
            <div className={styles.footer}>
              <Checkbox checked={rights} onChange={setRights}>
                {t('upload.rights')}
              </Checkbox>
              <Button size="lg" onClick={() => void publish()} disabled={!slot || !rights || !form.title.trim() || busy || cover.busy}>
                {busy ? '…' : t('upload.publish')}
              </Button>
            </div>
          </>
        )}
      </div>
      <PageFooter />
    </div>
  );
}

function EditUpload({ id }: { id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useMe();
  const track = useTrack(id);
  const cover = useCoverUpload();
  const update = useUpdateUpload();
  const remove = useDeleteUpload();
  const [form, setForm] = useState<FormState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Fill the form once: track details + current lyrics + moods (from the credits endpoint).
  useEffect(() => {
    const tr = track.data;
    if (!tr || form) return;
    void Promise.all([
      get<LyricsResponse>(`/tracks/${id}/lyrics`).catch(() => ({ kind: 'none', lines: [] }) as LyricsResponse),
      get<{ moods: string[] }>(`/tracks/${id}/credits`).catch(() => ({ moods: [] as string[] })),
    ]).then(([l, credits]) =>
      setForm({
        title: tr.title,
        artistName: tr.artists[0]?.name ?? '',
        genre: tr.genre ?? '',
        moods: credits.moods.slice(0, 3),
        visibility: tr.visibility,
        explicit: tr.explicit,
        lyrics: linesToText(l),
      }),
    );
  }, [track.data, form, id]);

  if (track.isLoading || (track.data && !form)) return <div className={page.centered}><Spinner /></div>;
  const tr = track.data;
  if (!tr || !me || tr.uploader?.id !== me.id || !form) {
    return (
      <div className={page.empty}>
        <h2>{t('notFound.title')}</h2>
        <Link to="/collection/uploads"><Button variant="white">{t('upload.myUploads')}</Button></Link>
      </div>
    );
  }

  const save = () =>
    update.mutate(
      {
        id,
        title: form.title.trim(),
        genre: form.genre || null,
        visibility: form.visibility,
        explicit: form.explicit,
        lyrics: form.lyrics.trim() || null,
        moods: form.moods,
        ...(cover.path ? { coverPath: cover.path } : {}),
      },
      { onSuccess: () => navigate('/collection/uploads') },
    );

  return (
    <div className={page.page}>
      <div className={styles.studio}>
        <header className={styles.head}>
          <h1>{t('upload.editTitle')}</h1>
          <p className={styles.hint}>
            {tr.title} • {formatDuration(tr.durationMs)}
            {tr.features.bpm ? ` • ${Math.round(tr.features.bpm)} BPM` : ''}
            {tr.features.key ? ` • ${tr.features.key} (${tr.features.camelot})` : ''}
          </p>
        </header>
        <DetailsForm form={form} setForm={(f) => setForm(f)} cover={cover.preview ?? tr.album?.coverUrl ?? null} onCover={(f) => void cover.upload(f)} coverBusy={cover.busy} showArtist={false} />
        <div className={styles.footer}>
          <Button variant="outline" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={16} /> {t('upload.delete')}
          </Button>
          <Button size="lg" onClick={save} disabled={!form.title.trim() || update.isPending || cover.busy}>
            {t('upload.saveChanges')}
          </Button>
        </div>
      </div>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete} title={t('upload.deleteTitle')}>
        <p className={styles.hint}>{t('upload.deleteBody', { title: tr.title, app: BRAND.name })}</p>
        <div className={styles.dialogActions}>
          <Button variant="text" onClick={() => setConfirmDelete(false)}>{t('upload.cancel')}</Button>
          <Button variant="white" disabled={remove.isPending} onClick={() => remove.mutate(id, { onSuccess: () => navigate('/collection/uploads') })}>
            {t('upload.delete')}
          </Button>
        </div>
      </Dialog>
      <PageFooter />
    </div>
  );
}
