import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useArtistPage, useDiscography } from '@/api/queries';
import { PageFooter } from '@/components/layout/PageFooter';
import { CardGrid } from '@/components/media/Shelf';
import { Chip, Spinner } from '@/components/ui/Dialog';
import page from '../page.module.css';

const GROUPS = ['all', 'album', 'single', 'compilation'] as const;

export function DiscographyPage() {
  const { id = '', group = 'all' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const artist = useArtistPage(id);
  const { data, isLoading } = useDiscography(id, group);
  const label = (g: string) => (g === 'all' ? t('search.all') : g === 'album' ? t('artist.albums') : g === 'single' ? t('artist.singles') : t('artist.compilations'));
  return (
    <div className={page.page}>
      <div className={page.content} style={{ paddingTop: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em' }}>
          <Link to={`/artist/${id}`}>{artist.data?.artist.name}</Link>
        </h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '16px 0' }}>
          {GROUPS.map((g) => (
            <Chip key={g} selected={g === group} onClick={() => navigate(`/artist/${id}/discography/${g}`)}>
              {label(g)}
            </Chip>
          ))}
        </div>
      </div>
      <div className={page.sections}>{isLoading ? <Spinner /> : <CardGrid items={data?.items ?? []} variant="discography" />}</div>
      <PageFooter />
    </div>
  );
}
