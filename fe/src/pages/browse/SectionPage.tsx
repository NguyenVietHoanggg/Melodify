import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useSectionPage } from '@/api/queries';
import { PageFooter } from '@/components/layout/PageFooter';
import { CardGrid } from '@/components/media/Shelf';
import { Spinner } from '@/components/ui/Dialog';
import { sectionTitle } from '../home/HomePage';
import page from '../page.module.css';

/** "Show all" page of a home shelf. */
export function SectionPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { data, isLoading } = useSectionPage(id);
  if (isLoading || !data) return <div className={page.centered}><Spinner /></div>;
  return (
    <div className={page.page}>
      <div className={page.content} style={{ paddingTop: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 16 }}>{sectionTitle(data, t)}</h1>
      </div>
      <div className={page.sections}>
        <CardGrid items={data.items} />
      </div>
      <PageFooter />
    </div>
  );
}
