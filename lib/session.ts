import 'server-only';
import { auth, authEnabled, isAllowedEmail } from '@/auth';

/** Current viewer. With login off (local dev) everyone is a local session. */
export async function getViewer() {
  if (!authEnabled) return { email: null, authEnabled: false };
  const session = await auth();
  return { email: session?.user?.email ?? null, authEnabled: true };
}

/** Guard for route handlers (middleware already guards; this is defence in depth). */
export async function requireViewer() {
  if (!authEnabled) {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_NO_AUTH !== 'true') return false;
    return true;
  }
  const session = await auth();
  return isAllowedEmail(session?.user?.email);
}
