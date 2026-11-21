import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

/** Login is on as soon as a Google OAuth client is configured. */
export const authEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
const allowedDomain = (process.env.ALLOWED_EMAIL_DOMAIN || 'whitecarrot.io').toLowerCase();

export function isAllowedEmail(email: string | null | undefined) {
  return Boolean(email && email.toLowerCase().endsWith(`@${allowedDomain}`));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google({ authorization: { params: { hd: allowedDomain, prompt: 'select_account' } } })],
  pages: { signIn: '/login', error: '/login' },
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 },
  trustHost: true,
  callbacks: {
    // `hd` above only pre-filters Google's account picker; this is the real check.
    signIn({ profile }) {
      return Boolean(profile?.email_verified) && isAllowedEmail(profile?.email);
    },
    authorized({ auth }) {
      return isAllowedEmail(auth?.user?.email);
    },
  },
});
