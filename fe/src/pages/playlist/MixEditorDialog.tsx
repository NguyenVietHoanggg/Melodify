/**
 * Mix editor (Premium): pick how one song blends into the next. The backend computes the recipe
 * (gain curves + filter sweep); here we only show it — the two curves are drawn as an SVG chart.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CurvePoint, TransitionPreset, TransitionRecipe } from '@contracts';
import { Cover } from '@/components/media/Cover';
import type { ListTrack } from '@/components/tracks/TrackList';
import { Button } from '@/components/ui/Button';
import { Chip, Dialog } from '@/components/ui/Dialog';
import { Slider } from '@/components/ui/Slider';
import { errorMessage, get, put } from '@/lib/api';
import { toast } from '@/stores/toast';
import styles from './playlist.module.css';

export interface MixPair {
  from: ListTrack;
  to: ListTrack;
}

const PRESETS: ('auto' | TransitionPreset)[] = ['auto', 'fade', 'rise', 'blend', 'wave', 'melt', 'slam'];

function path(curve: CurvePoint[], w: number, h: number) {
  return curve.map((p, i) => `${i ? 'L' : 'M'}${(p.t * w).toFixed(1)},${(h - Math.min(1, p.v) * h).toFixed(1)}`).join(' ');
}

function TrackInfo({ track, side }: { track: ListTrack; side: string }) {
  return (
    <div className={styles.mixTrack}>
      <span className={styles.mixSide}>{side}</span>
      <div className={styles.mixCover}>
        <Cover imageUrl={track.album?.coverUrl} radius="sm" />
      </div>
      <strong className="ellipsis">{track.title}</strong>
      <span className={styles.mixFeat}>
        <b>{track.features.bpm ?? '–'}</b> BPM · <b>{track.features.key ?? '–'}</b> ({track.features.camelot ?? '–'})
      </span>
      <div className={styles.energy} title="Energy">
        <span style={{ width: `${Math.round((track.features.energy ?? 0) * 100)}%` }} />
      </div>
    </div>
  );
}

export function MixEditorDialog({ playlistId, pair, onClose }: { playlistId: string; pair: MixPair; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const current = pair.from.transition;
  const [preset, setPreset] = useState<'auto' | TransitionPreset>(!current || current.auto ? 'auto' : current.preset);
  const [duration, setDuration] = useState(current?.durationMs ?? 8000);
  const [saving, setSaving] = useState(false);
  const { data: recipe } = useQuery({
    queryKey: ['mix-recipe', pair.from.id, pair.to.id, preset, preset === 'auto' ? 0 : duration],
    queryFn: () =>
      get<TransitionRecipe>(`/mix/recipe?from=${pair.from.id}&to=${pair.to.id}&preset=${preset}${preset === 'auto' ? '' : `&durationMs=${duration}`}`),
    placeholderData: (prev) => prev,
  });

  const save = async () => {
    setSaving(true);
    try {
      await put(`/playlists/${playlistId}/tracks/${pair.from.itemId}/transition`, {
        transition: preset === 'auto' ? null : { preset, durationMs: Math.round(duration) },
      });
      void qc.invalidateQueries({ queryKey: ['playlist-tracks', playlistId] });
      onClose();
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const W = 460;
  const H = 110;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('mix.title')} className={styles.mixDialog}>
      <div className={styles.mixTracks}>
        <TrackInfo track={pair.from} side={t('mix.outgoing')} />
        <span className={styles.mixArrow}>→</span>
        <TrackInfo track={pair.to} side={t('mix.incoming')} />
      </div>
      <div className={styles.mixChart}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={t('mix.curves')}>
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} stroke="#ffffff14" />
          ))}
          {recipe && (
            <>
              <path d={path(recipe.out.gain, W, H)} fill="none" stroke="#fff" strokeWidth={2.5} />
              <path d={path(recipe.in.gain, W, H)} fill="none" stroke="#1ed760" strokeWidth={2.5} />
            </>
          )}
        </svg>
        <div className={styles.mixLegend}>
          <span><i style={{ background: '#fff' }} />{t('mix.outgoing')}</span>
          <span><i style={{ background: '#1ed760' }} />{t('mix.incoming')}</span>
          {recipe?.out.filter && <span>{t('mix.filter', { type: recipe.out.filter.type })}</span>}
          {recipe?.tempoMatchRate && <span>{t('mix.tempoMatch', { pct: ((recipe.tempoMatchRate - 1) * 100).toFixed(1) })}</span>}
          {recipe && <span>{(recipe.durationMs / 1000).toFixed(1)}s</span>}
        </div>
      </div>
      <div className={styles.mixPresets}>
        {PRESETS.map((p) => (
          <Chip key={p} selected={preset === p} onClick={() => setPreset(p)}>
            {t(`mix.presets.${p}`)}
          </Chip>
        ))}
      </div>
      <p className={styles.mixHint}>{t(`mix.hints.${preset}`)}</p>
      {preset !== 'auto' && (
        <div className={styles.mixDuration}>
          <span>{t('mix.duration')}</span>
          <Slider value={duration} max={16000} step={500} label={t('mix.duration')} onChange={(v) => setDuration(Math.max(1000, v))} onCommit={(v) => setDuration(Math.max(1000, Math.round(v / 500) * 500))} />
          <span className={styles.mixSeconds}>{(duration / 1000).toFixed(1)}s</span>
        </div>
      )}
      <div className={styles.mixActions}>
        <Button variant="text" onClick={onClose}>{t('mix.cancel')}</Button>
        <Button variant="white" size="sm" onClick={() => void save()} disabled={saving}>
          {t('entity.save')}
        </Button>
      </div>
    </Dialog>
  );
}
