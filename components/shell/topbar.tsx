'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Loader2, LogOut, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEFAULT_RANGE, MARKETS, RANGES } from '@/lib/filters';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ThemeToggle } from './theme-provider';
import { OVERVIEW, SECTIONS } from './nav';
import { isActive, useSharedQuery } from './sidebar';

const RANGE_LABEL: Record<string, string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', all: 'All time' };

export function Topbar({
  user,
  refreshAction,
  signOutAction,
}: {
  user: { email: string | null; authEnabled: boolean };
  refreshAction: () => Promise<void>;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const query = useSharedQuery();
  const [pending, startTransition] = useTransition();

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    startTransition(() => router.push(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false }));
  };

  const showMarket = pathname !== '/applications';

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-3 md:px-6">
        {/* The three-way section toggle, plus Overview */}
        <nav aria-label="Sections" className="flex items-center rounded-lg border bg-card p-1 shadow-sm">
          {[OVERVIEW, ...SECTIONS].map(item => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={`${item.href}${query}`}
                aria-current={active ? 'page' : undefined}
                title={item.label}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                  active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className={cn(item.href === '/' ? 'sr-only xl:not-sr-only' : 'hidden sm:inline')}>{item.short}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" />}
          <Select value={sp.get('range') ?? DEFAULT_RANGE} onValueChange={v => setParam('range', v === DEFAULT_RANGE ? null : v)}>
            <SelectTrigger className="h-9 w-[140px] bg-card" aria-label="Date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map(r => (
                <SelectItem key={r} value={r}>{RANGE_LABEL[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showMarket && (
            <Select value={sp.get('market') ?? 'all'} onValueChange={v => setParam('market', v === 'all' ? null : v)}>
              <SelectTrigger className="h-9 w-[150px] bg-card" aria-label="Market">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All markets</SelectItem>
                {MARKETS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <form action={refreshAction}>
            <Button type="submit" variant="outline" size="sm" className="h-9 bg-card" title="Re-read both databases now">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
          </form>
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="Account">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  {(user.email ?? '?').slice(0, 1).toUpperCase()}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <div className="text-sm font-medium">{user.email ?? 'Local session'}</div>
                <div className="text-xs text-muted-foreground">
                  {user.authEnabled ? 'Signed in with Google' : 'Login is off (local development)'}
                </div>
              </DropdownMenuLabel>
              {user.authEnabled && (
                <>
                  <DropdownMenuSeparator />
                  <form action={signOutAction}>
                    <DropdownMenuItem asChild>
                      <button type="submit" className="w-full">
                        <LogOut className="mr-2 h-4 w-4" /> Sign out
                      </button>
                    </DropdownMenuItem>
                  </form>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
