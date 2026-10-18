/** /invite/:token — someone shared "Invite collaborators": join and jump to the playlist. */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useMe } from '@/api/queries';
import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { errorMessage, post } from '@/lib/api';
import page from '../page.module.css';

export function InvitePage() {
  const { token = '' } = useParams();
  const { t } = useTranslation();
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    setBusy(true);
    try {
      const { playlistId } = await post<{ playlistId: string }>(`/playlist-invites/${encodeURIComponent(token)}/accept`);
      void qc.invalidateQueries({ queryKey: ['library'] });
      navigate(`/playlist/${playlistId}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className={page.empty}>
      <Icon name="friends" size={64} />
      <h2>{t('invite.title')}</h2>
      <p className={page.muted}>{error || t('invite.body')}</p>
      {me ? (
        <Button variant="white" onClick={() => void accept()} disabled={busy || Boolean(error)}>
          {t('invite.accept')}
        </Button>
      ) : (
        <Link to={`/login?continue=${encodeURIComponent(`/invite/${token}`)}`}>
          <Button variant="white">{t('invite.loginFirst')}</Button>
        </Link>
      )}
    </div>
  );
}
