/**
 * Shown on the owner's AI playlists: what the AI understood (as chips) and a box to refine it
 * ("more upbeat", "add some EDM") — the playlist is rebuilt in place.
 */
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiIntent } from '@contracts';
import { useRefineAiPlaylist } from '@/api/mutations';
import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import styles from './ai.module.css';

const level = (r: [number, number] | null, names: [string, string, string]) => {
  if (!r) return null;
  const mid = (r[0] + r[1]) / 2;
  return mid < 0.4 ? names[0] : mid > 0.62 ? names[2] : names[1];
};

export function AiIntentChips({ intent }: { intent: AiIntent }) {
  const { t } = useTranslation();
  const chips = [
    ...intent.genres.map((g) => t(`genres.${g}`, { defaultValue: g })),
    ...intent.moods.map((m) => t(`moods.${m}`, { defaultValue: m })),
    level(intent.energy, [t('ai.energy.low'), t('ai.energy.medium'), t('ai.energy.high')]),
    level(intent.valence, [t('ai.valence.sad'), t('ai.valence.neutral'), t('ai.valence.happy')]),
    intent.bpm ? `${intent.bpm[0]}–${intent.bpm[1]} BPM` : null,
    ...intent.decades.map((d) => t('ai.decade', { decade: d })),
    ...intent.artists,
    ...intent.keywords.map((k) => `#${k}`),
  ].filter(Boolean) as string[];
  if (!chips.length) return null;
  return (
    <ul className={styles.intent}>
      {chips.map((c) => (
        <li key={c}>{c}</li>
      ))}
    </ul>
  );
}

export function AiRefinePanel({ playlistId, ai }: { playlistId: string; ai: { prompts: string[]; intent: AiIntent; usedAi: boolean } }) {
  const { t } = useTranslation();
  const refine = useRefineAiPlaylist();
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 3) return;
    refine.mutate({ id: playlistId, prompt: text.trim() }, { onSuccess: () => setText('') });
  };
  return (
    <section className={styles.refine}>
      <div className={styles.refineHead}>
        <Icon name="sparkle" size={16} />
        <span>{t('ai.understood')}</span>
      </div>
      {ai.prompts.length > 0 && <p className={styles.prompts}>{ai.prompts.map((p) => `“${p}”`).join(' → ')}</p>}
      <AiIntentChips intent={ai.intent} />
      <form className={styles.refineBox} onSubmit={submit}>
        <input value={text} maxLength={300} placeholder={t('ai.refinePlaceholder')} aria-label={t('ai.refine')} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" variant="white" size="sm" disabled={text.trim().length < 3 || refine.isPending}>
          {refine.isPending ? '…' : t('ai.refine')}
        </Button>
      </form>
    </section>
  );
}
