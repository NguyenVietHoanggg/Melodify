import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router/dom';
import { useSession } from '@/api/queries';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { setLanguage } from '@/i18n';
import { queryClient } from '@/lib/queryClient';
import { refreshPlayer } from '@/player/commands';
import { startPlayerController } from '@/player/controller';
import { registerShortcuts } from '@/player/shortcuts';
import { connectSocket, disconnectSocket } from '@/player/socket';
import { router } from './router';

let shortcutsRegistered = false;

/** Once we know who the user is: connect the realtime socket and start the audio controller. */
function SessionBoot() {
  const { data } = useSession();
  const me = data?.me;
  useEffect(() => {
    if (!me) {
      disconnectSocket();
      return;
    }
    try {
      if (!localStorage.getItem('melodify.lang')) setLanguage(me.locale);
    } catch {
      // ignore
    }
    startPlayerController();
    connectSocket();
    void refreshPlayer();
    if (!shortcutsRegistered) {
      shortcutsRegistered = true;
      registerShortcuts(() => Boolean(queryClient.getQueryData<{ me: typeof me }>(['session'])?.me?.entitlements.smartShuffle));
    }
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SessionBoot />
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
