import { useToasts } from '@/stores/toast';
import styles from './layout.module.css';

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className={styles.toaster} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={styles.toast}>
          <span>{t.message}</span>
          {t.action && (
            <button type="button" onClick={t.action.onClick}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
