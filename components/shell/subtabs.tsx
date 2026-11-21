'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useSharedQuery } from './sidebar';

/** Secondary tabs inside a section (e.g. Reached out → Outbound email | Outbound calls). */
export function SubTabs({ tabs }: { tabs: { href: string; label: string; badge?: string }[] }) {
  const pathname = usePathname();
  const query = useSharedQuery();
  return (
    <nav aria-label="Channel" className="mb-5 flex gap-1 border-b">
      {tabs.map(t => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={`${t.href}${query}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors',
              active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {t.badge && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
