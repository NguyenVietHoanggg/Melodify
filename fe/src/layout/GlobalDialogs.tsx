/**
 * Dialogs that any menu can open (via the useDialogs store): Credits, Keyboard shortcuts, Report upload,
 * "Are you sure?" and "Name it…". Mounted once in the app shell.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useReportTrack } from '@/api/mutations';
import { useCredits } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { Dialog, Spinner } from '@/components/ui/Dialog';
import { RadioGroup, TextArea, TextField } from '@/components/ui/Form';
import { errorMessage } from '@/lib/api';
import { textError } from '@/lib/validate';
import { SHORTCUTS } from '@/player/shortcuts';
import { useDialogs } from '@/stores/dialogs';
import styles from './dialogs.module.css';

function CreditsDialog() {
  const { t } = useTranslation();
  const id = useDialogs((s) => s.creditsTrackId);
  const close = () => useDialogs.getState().openCredits(null);
  const { data, isLoading } = useCredits(id);
  const f = data?.track.features;
  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => !o && close()} title={t('credits.title')} className={styles.credits}>
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <div className={styles.creditsBody}>
          <h3 className={styles.trackTitle}>{data.track.title}</h3>
          <section>
            <h4>{t('credits.performedBy')}</h4>
            {data.performedBy.map((a, i) => (
              <div key={a.id} className={styles.person}>
                <Link to={`/artist/${a.id}`} onClick={close}>{a.name}</Link>
                <span>{i === 0 ? t('npv.mainArtist') : t('card.artist')}</span>
              </div>
            ))}
          </section>
          {(data.genre || data.moods.length > 0) && (
            <section>
              {data.genre && (
                <>
                  <h4>{t('credits.genre')}</h4>
                  <p>{t(`genres.${data.genre}`, { defaultValue: data.genre })}</p>
                </>
              )}
              {data.moods.length > 0 && (
                <>
                  <h4>{t('credits.moods')}</h4>
                  <p>{data.moods.map((m) => t(`moods.${m}`, { defaultValue: m })).join(', ')}</p>
                </>
              )}
            </section>
          )}
          {f && (f.bpm || f.key) && (
            <section>
              <h4>{t('credits.audio')}</h4>
              <p>{[f.bpm && `${Math.round(f.bpm)} BPM`, f.key && `${f.key} (${f.camelot})`, f.energy != null && `Energy ${Math.round(f.energy * 100)}%`].filter(Boolean).join(' • ')}</p>
            </section>
          )}
          <section>
            <h4>{t('credits.source')}</h4>
            {data.track.origin === 'upload' ? (
              <p>{t('credits.uploadedBy')}{data.track.uploader && <> • <Link to={`/user/${data.track.uploader.id}`} onClick={close}>{data.track.uploader.displayName}</Link></>}</p>
            ) : data.source.url ? (
              <a href={data.source.url} target="_blank" rel="noopener noreferrer" className={styles.external}>
                {t('credits.openSource', { provider: data.source.provider })} <Icon name="external" size={12} />
              </a>
            ) : (
              <p>{data.source.provider}</p>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}

function ShortcutsDialog() {
  const { t } = useTranslation();
  const open = useDialogs((s) => s.shortcuts);
  return (
    <Dialog open={open} onOpenChange={(o) => useDialogs.getState().openShortcuts(o)} title={t('shortcuts.title')} className={styles.shortcuts}>
      <dl className={styles.shortcutList}>
        {SHORTCUTS.map((s) => (
          <div key={s.action} className={styles.shortcutRow}>
            <dt>{t(`shortcuts.${s.action}`)}</dt>
            <dd>
              {s.keys.split(' + ').map((k, i) => (
                <span key={i}>
                  {i > 0 && <span className={styles.plus}>+</span>}
                  <kbd>{k}</kbd>
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

function ReportDialog() {
  const { t } = useTranslation();
  const track = useDialogs((s) => s.reportTrack);
  const close = () => useDialogs.getState().openReport(null);
  const report = useReportTrack();
  const [reason, setReason] = useState<'copyright' | 'offensive' | 'spam' | 'other' | null>(null);
  const [details, setDetails] = useState('');
  const [tried, setTried] = useState(false);
  const detailsError = reason === 'other' ? textError(details, { min: 5, max: 1000 }) : textError(details, { max: 1000, required: false });
  const submit = () => {
    setTried(true);
    if (!track || !reason || detailsError) return;
    report.mutate({ id: track.id, reason, details: details.trim() || undefined }, {
      onSuccess: () => {
        close();
        setReason(null);
        setDetails('');
        setTried(false);
      },
    });
  };
  return (
    <Dialog open={Boolean(track)} onOpenChange={(o) => !o && close()} title={t('report.title')} className={styles.report}>
      <p className={styles.muted}>{track?.title}</p>
      <p>{t('report.body')}</p>
      <RadioGroup
        name="report-reason"
        className={styles.reasons}
        value={reason}
        onChange={setReason}
        options={(['copyright', 'offensive', 'spam', 'other'] as const).map((r) => ({ value: r, label: t(`report.reasons.${r}`) }))}
      />
      <TextArea
        label={t('report.details')}
        hint={reason === 'other' ? t('report.detailsRequired') : undefined}
        value={details}
        maxLength={1000}
        error={tried ? detailsError : ''}
        onChange={(e) => setDetails(e.target.value)}
        rows={3}
      />
      <div className={styles.footer}>
        <Button variant="text" onClick={close}>{t('upload.cancel')}</Button>
        <Button variant="white" disabled={!reason || report.isPending} onClick={submit}>{t('report.submit')}</Button>
      </div>
    </Dialog>
  );
}

function ConfirmDialog() {
  const { t } = useTranslation();
  const request = useDialogs((s) => s.confirm);
  const close = () => useDialogs.getState().openConfirm(null);
  return (
    <Dialog open={Boolean(request)} onOpenChange={(o) => !o && close()} title={request?.title ?? ''} className={styles.report}>
      {request?.body && <p className={styles.muted}>{request.body}</p>}
      <div className={styles.footer}>
        <Button variant="text" onClick={close}>{t('upload.cancel')}</Button>
        <Button
          variant="primary"
          onClick={() => {
            request?.onConfirm();
            close();
          }}
          autoFocus
        >
          {request?.confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

function TextPromptDialog() {
  const { t } = useTranslation();
  const request = useDialogs((s) => s.textPrompt);
  const close = () => useDialogs.getState().openTextPrompt(null);
  const [value, setValue] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  useEffect(() => {
    setValue(request?.initial ?? '');
    setTried(false);
    setServerError('');
  }, [request]);
  const error = request ? textError(value, { max: request.max }) : '';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!request || error) return;
    setBusy(true);
    try {
      await request.onSubmit(value.trim());
      close();
    } catch (err) {
      setServerError(errorMessage(err));
    }
    setBusy(false);
  };
  return (
    <Dialog open={Boolean(request)} onOpenChange={(o) => !o && close()} title={request?.title ?? ''} className={styles.report}>
      <form onSubmit={submit} className={styles.promptForm} noValidate>
        <TextField
          label={request?.label}
          value={value}
          maxLength={request?.max}
          error={(tried && error) || serverError}
          onChange={(e) => {
            setValue(e.target.value);
            setServerError('');
          }}
          onFocus={(e) => e.target.select()}
          autoFocus
        />
        <div className={styles.footer}>
          <Button variant="text" type="button" onClick={close}>{t('upload.cancel')}</Button>
          <Button variant="white" type="submit" disabled={busy}>{request?.confirmLabel}</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function GlobalDialogs() {
  return (
    <>
      <CreditsDialog />
      <ShortcutsDialog />
      <ReportDialog />
      <ConfirmDialog />
      <TextPromptDialog />
    </>
  );
}
