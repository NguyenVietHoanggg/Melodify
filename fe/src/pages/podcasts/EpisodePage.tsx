/** One episode (/episode/:id): header, play / save / more, date & length, description, more episodes. */
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useEpisodeProgress, useToggleSavedEpisode } from '@/api/mutations';
import { useEpisodePage, useMe } from '@/api/queries';
import { ActionBar, EntityBody, EntityHeader } from '@/components/entity/EntityHeader';
import { StickyBar } from '@/components/entity/StickyBar';
import entity from '@/components/entity/entity.module.css';
import { Icon } from '@/components/icons/Icon';
import { PageFooter } from '@/components/layout/PageFooter';
import { Cover } from '@/components/media/Cover';
import { Explicit, PlayButton } from '@/components/media/PlayButton';
import { EpisodeRow } from '@/components/podcasts/EpisodeRow';
import { Linkified } from '@/components/text/Linkified';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Dialog';
import { DropdownMenu } from '@/components/ui/Menu';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatEpisodeLength, formatShortDate } from '@/lib/format';
import { addToQueue, pause, playContext, resume } from '@/player/commands';
import { usePlayer } from '@/player/store';
import { toast } from '@/stores/toast';
import page from '../page.module.css';
import styles from './podcast.module.css';

export function EpisodePage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'vi' ? 'vi' : 'en';
  const navigate = useNavigate();
  const me = useMe();
  const { data, isLoading } = useEpisodePage(id);
  const save = useToggleSavedEpisode();
  const progress = useEpisodeProgress();
  const isCurrent = usePlayer((s) => s.view?.current?.episode?.id === id);
  const playing = usePlayer((s) => Boolean(s.view?.isPlaying));

  if (isLoading) return <div className={page.centered}><Spinner /></div>;
  if (!data) {
    return (
      <div className={page.empty}>
        <h2>{t('notFound.title')}</h2>
        <Link to="/"><Button variant="white">{t('notFound.home')}</Button></Link>
      </div>
    );
  }
  const { episode: e, show, more } = data;
  const color = show.dominantColor ?? '#535353';
  const done = e.progress?.completed ?? false;
  const play = () => {
    if (isCurrent) void (playing ? pause() : resume());
    else void playContext({ context: { type: 'show', id: show.id }, offset: { trackId: e.id }, promptImage: e.imageUrl });
  };

  return (
    <div className={page.page}>
      <StickyBar color={color}>
        <PlayButton context={{ type: 'show', id: show.id }} offset={{ trackId: e.id }} uri={`melodify:show:${show.id}`} name={e.title} />
        <span className={entity.stickyTitle}>{e.title}</span>
      </StickyBar>
      <EntityHeader
        color={color}
        cover={<Cover imageUrl={e.imageUrl} radius="lg" fallbackIcon="podcast" eager />}
        label={t('podcast.episode')}
        title={e.title}
        meta={
          <Link to={`/show/${show.id}`}>
            <strong>{show.title}</strong>
          </Link>
        }
      />
      <EntityBody color={color}>
        <div className={styles.episodeMeta}>
          {e.explicit && <Explicit />}
          {e.releaseDate && <span>{formatShortDate(e.releaseDate, lang)}</span>}
          <span>•</span>
          <span>{formatEpisodeLength(e.durationMs, lang)}</span>
          {done && (
            <span className={styles.played}>
              <Icon name="checkCircle" size={16} /> {t('podcast.played')}
            </span>
          )}
        </div>
        <ActionBar>
          <button type="button" className={styles.bigPlay} onClick={play} aria-label={isCurrent && playing ? t('actions.pauseName', { name: e.title }) : t('actions.playName', { name: e.title })}>
            <Icon name={isCurrent && playing ? 'pause' : 'play'} size={24} />
          </button>
          {me && (
            <Tooltip label={e.isSaved ? t('podcast.unsave') : t('podcast.save')}>
              <button type="button" className={`${entity.bigIcon} ${e.isSaved ? entity.on : ''}`} onClick={() => save.mutate({ id: e.id, saved: !e.isSaved })}>
                <Icon name={e.isSaved ? 'checkCircle' : 'addCircle'} size={32} />
              </button>
            </Tooltip>
          )}
          <DropdownMenu
            entries={[
              ...(me
                ? [
                    { label: t('menu.addToQueue'), icon: 'queue' as const, onSelect: () => void addToQueue([{ kind: 'episode', id: e.id }]) },
                    { label: done ? t('podcast.markUnplayed') : t('podcast.markPlayed'), icon: 'check' as const, onSelect: () => progress.mutate({ id: e.id, completed: !done }) },
                  ]
                : []),
              { label: t('podcast.goToShow'), icon: 'podcast' as const, onSelect: () => navigate(`/show/${show.id}`) },
              { kind: 'separator' as const },
              { label: t('menu.copyLink'), icon: 'link' as const, onSelect: () => void navigator.clipboard.writeText(location.href).then(() => toast(t('actions.linkCopied'))) },
            ]}
            trigger={
              <button type="button" className={entity.bigIcon} aria-label={t('actions.moreOptions', { name: e.title })}>
                <Icon name="more" size={32} />
              </button>
            }
          />
        </ActionBar>
        <div className={styles.episodeBody}>
          <h2>{t('podcast.episodeDescription')}</h2>
          {e.description && <Linkified text={e.description} className={styles.description} />}
          <Link to={`/show/${show.id}`}>
            <Button variant="outline" size="sm">{t('podcast.seeAllEpisodes')}</Button>
          </Link>
        </div>
        {more.length > 0 && (
          <section className={styles.moreEpisodes}>
            <h2>{t('podcast.moreEpisodes')}</h2>
            {more.map((x) => (
              <EpisodeRow key={x.id} episode={x} context={{ type: 'show', id: show.id }} />
            ))}
          </section>
        )}
      </EntityBody>
      <PageFooter />
    </div>
  );
}
