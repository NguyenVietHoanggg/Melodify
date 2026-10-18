import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import type { Card } from '@contracts';
import { PageFooter } from '@/components/layout/PageFooter';
import { CardGrid } from '@/components/media/Shelf';
import { get } from '@/lib/api';
import page from '../page.module.css';

export function RelatedPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['related', id], queryFn: () => get<{ items: Card[] }>(`/artists/${id}/related`) });
  return (
    <div className={page.page}>
      <div className={page.content} style={{ paddingTop: 24 }}>
        <h1 className={page.sectionTitle} style={{ fontSize: 32 }}>{t('artist.fansAlsoLike')}</h1>
      </div>
      <div className={page.sections}>
        <CardGrid items={data?.items ?? []} />
      </div>
      <PageFooter />
    </div>
  );
}
