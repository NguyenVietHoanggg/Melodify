/** /collection — "Your Library" as a page of its own (the Library tab on phones, the library icon on tablets). */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BRAND } from '@/config/brand';
import { LeftSidebar } from '@/layout/LeftSidebar';

export function LibraryPage() {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = `${t('library.title')} – ${BRAND.name}`;
  }, [t]);
  return <LeftSidebar asPage />;
}
