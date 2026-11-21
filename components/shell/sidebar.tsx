'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { OVERVIEW, SECTIONS, SHARED_PARAMS, type NavItem } from './nav';

export function useSharedQuery() {
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of SHARED_PARAMS) {
    const v = sp.get(k);
    if (v) keep.set(k, v);
  }
  const s = keep.toString();
  return s ? `?${s}` : '';
}

export function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

function Item({ item, pathname, query }: { item: NavItem; pathname: string; query: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={`${item.href}${query}`}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group -mr-3 flex items-start gap-3 rounded-l-lg border-r-2 px-3 py-2.5 text-sm transition-colors',
        active ? 'border-primary bg-accent text-primary' : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-primary' : '')} />
      <span className="min-w-0">
        <span className={cn('block font-medium', active ? 'text-foreground' : '')}>{item.short}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground line-clamp-2">{item.description}</span>
      </span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const query = useSharedQuery();
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">
      <div className="flex h-16 items-center gap-2.5 border-b px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-8 w-8 shrink-0" />
        <div className="leading-tight">
          <div className="font-display text-base font-semibold tracking-tight">Whitecarrot</div>
          <div className="text-xs text-muted-foreground">Data admin</div>
        </div>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto p-3" aria-label="Main">
        <div className="space-y-1">
          <Item item={OVERVIEW} pathname={pathname} query={query} />
        </div>
        <div>
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Marketing funnel</div>
          <div className="space-y-1">
            {SECTIONS.map(s => (
              <Item key={s.href} item={s} pathname={pathname} query={query} />
            ))}
          </div>
        </div>
      </nav>
      <div className="border-t p-4 text-xs leading-relaxed text-muted-foreground">
        Read-only. Numbers refresh every 10 minutes, or press Refresh.
      </div>
    </aside>
  );
}
