import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { LogoMark } from '@/components/brand/Logo';

/** Shown when a page crashes or fails to load (instead of a blank screen). */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : String(error);
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#121212', textAlign: 'center', padding: 32 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <LogoMark size={56} />
        <h1 style={{ fontSize: 32 }}>Something went wrong</h1>
        <p style={{ color: '#b3b3b3', maxWidth: 480 }}>{message}</p>
        <Link to="/" style={{ background: '#fff', color: '#000', padding: '12px 32px', borderRadius: 999, fontWeight: 700 }}>
          Home
        </Link>
      </div>
    </div>
  );
}
