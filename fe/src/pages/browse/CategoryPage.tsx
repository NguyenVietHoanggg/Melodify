import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useCategoryPage } from '@/api/queries';
import { PageFooter } from '@/components/layout/PageFooter';
import { Shelf } from '@/components/media/Shelf';
import { Spinner } from '@/components/ui/Dialog';
import { sectionTitle } from '../home/HomePage';
import page from '../page.module.css';
import styles from './browse.module.css';

/** /genre/:id — a browse category (Pop, Chill, Workout…). */
export function CategoryPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { data, isLoading } = useCategoryPage(id);
  if (isLoading || !data) return <div className={page.centered}><Spinner /></div>;
  return (
    <div className={page.page}>
      <header className={styles.header} style={{ backgroundColor: data.category.color }}>
        <h1 className={styles.title}>{data.category.name}</h1>
      </header>
      <div className={styles.body} style={{ ['--cat-color' as string]: data.category.color }}>
        <div className={page.sections} style={{ paddingTop: 24 }}>
          {data.sections.length ? (
            data.sections.map((s) => <Shelf key={s.id} title={sectionTitle(s, t)} items={s.items} seeAllPath={s.seeAllPath} />)
          ) : (
            <p className={page.muted} style={{ padding: '0 12px' }}>{t('library.noResults')}</p>
          )}
        </div>
      </div>
      <PageFooter />
    </div>
  );
}
