'use server';

import { revalidateTag } from 'next/cache';
import { auth, authEnabled, isAllowedEmail, signOut } from '@/auth';

async function assertAllowed() {
  if (!authEnabled) return;
  const session = await auth();
  if (!isAllowedEmail(session?.user?.email)) throw new Error('unauthorized');
}

/** Drop every cached query so the next render re-reads both databases. */
export async function refreshData() {
  await assertAllowed();
  revalidateTag('all');
}

export async function signOutAction() {
  await signOut({ redirectTo: '/login' });
}
