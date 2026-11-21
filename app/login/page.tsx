import { redirect } from 'next/navigation';
import { authEnabled, signIn } from '@/auth';
import { Button } from '@/components/ui/button';

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (!authEnabled) redirect('/');
  const callbackUrl = sp.callbackUrl?.startsWith('/') ? sp.callbackUrl : '/';
  const denied = sp.error === 'AccessDenied';

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary font-bold text-primary-foreground">W</div>
          <div>
            <div className="font-semibold">WhiteCarrot Admin</div>
            <div className="text-sm text-muted-foreground">Jobs &amp; applications data</div>
          </div>
        </div>
        {denied && (
          <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
            That account isn&apos;t allowed. Use your @whitecarrot.io Google account.
          </p>
        )}
        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: callbackUrl });
          }}
        >
          <Button type="submit" className="w-full">Continue with Google</Button>
        </form>
        <p className="mt-4 text-xs text-muted-foreground">Only @whitecarrot.io accounts can sign in.</p>
      </div>
    </main>
  );
}
