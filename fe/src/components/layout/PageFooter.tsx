import { useTranslation } from 'react-i18next';
import { BRAND } from '@/config/brand';
import styles from '@/pages/page.module.css';

/** The link columns at the bottom of every main-view page. */
export function PageFooter() {
  const { i18n } = useTranslation();
  const vi = i18n.language === 'vi';
  const cols = [
    { title: vi ? 'Công ty' : 'Company', links: vi ? ['Giới thiệu', 'Việc làm', 'For the Record'] : ['About', 'Jobs', 'For the Record'] },
    { title: vi ? 'Cộng đồng' : 'Communities', links: vi ? ['Dành cho các Nghệ sĩ', 'Nhà phát triển', 'Quảng cáo'] : ['For Artists', 'Developers', 'Advertising'] },
    { title: vi ? 'Liên kết hữu ích' : 'Useful links', links: vi ? ['Hỗ trợ', 'Ứng dụng Di động Miễn phí'] : ['Support', 'Free Mobile App'] },
    { title: vi ? `Các gói của ${BRAND.name}` : `${BRAND.name} Plans`, links: ['Premium Individual', 'Premium Student', `${BRAND.name} Free`] },
  ];
  return (
    <footer className={styles.footer}>
      <div className={styles.footerCols}>
        {cols.map((c) => (
          <div key={c.title} className={styles.footerCol}>
            <h3>{c.title}</h3>
            {c.links.map((l) => (
              <a key={l} href={l.includes('Premium') ? '/premium' : '#'}>
                {l}
              </a>
            ))}
          </div>
        ))}
      </div>
      <div className={styles.footerBottom}>© {new Date().getFullYear()} {BRAND.name} — {vi ? 'dự án học tập, giao diện lấy cảm hứng từ Spotify' : 'learning project inspired by Spotify'}</div>
    </footer>
  );
}
