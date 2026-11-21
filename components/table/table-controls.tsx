'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight, Download, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function useParamHref() {
  const pathname = usePathname();
  const sp = useSearchParams();
  return (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === '') next.delete(k);
      else next.set(k, v);
    }
    return `${pathname}${next.size ? `?${next}` : ''}`;
  };
}

/** Debounced search box bound to ?q=. */
export function SearchBox({ placeholder }: { placeholder: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const href = useParamHref();
  const [value, setValue] = useState(sp.get('q') ?? '');
  const [pending, start] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => start(() => router.replace(href({ q: value.trim() || null, page: null, job: null }), { scroll: false })), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative w-full sm:w-72">
      {pending ? (
        <Loader2 className="absolute left-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      )}
      <Input value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} className="h-9 pl-8 pr-8" aria-label={placeholder} />
      {value && (
        <button type="button" onClick={() => setValue('')} className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground" aria-label="Clear search">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Pill filters bound to ?status= (or another param). */
export function FilterPills({ options, param = 'status' }: { options: { value: string; label: string }[]; param?: string }) {
  const sp = useSearchParams();
  const href = useParamHref();
  const current = sp.get(param);
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter">
      {[{ value: '', label: 'All' }, ...options].map(o => {
        const active = (current ?? '') === o.value;
        return (
          <Link
            key={o.value || 'all'}
            href={href({ [param]: o.value || null, page: null })}
            scroll={false}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

export function Pager({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const href = useParamHref();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
      <span className="tabular">
        {start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <Button asChild={page > 1} variant="outline" size="sm" disabled={page <= 1} className="h-8">
          {page > 1 ? (
            <Link href={href({ page: String(page - 1) })} scroll={false} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Link>
          ) : (
            <span><ChevronLeft className="h-4 w-4" /></span>
          )}
        </Button>
        <span className="tabular px-2">
          {page} / {pages.toLocaleString()}
        </span>
        <Button asChild={page < pages} variant="outline" size="sm" disabled={page >= pages} className="h-8">
          {page < pages ? (
            <Link href={href({ page: String(page + 1) })} scroll={false} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Link>
          ) : (
            <span><ChevronRight className="h-4 w-4" /></span>
          )}
        </Button>
      </div>
    </div>
  );
}

/** Link to a row's detail drawer (?job=id), keeping the current filters. */
export function RowLink({ id, param = 'job', children, className }: { id: string; param?: string; children: React.ReactNode; className?: string }) {
  const href = useParamHref();
  return (
    <Link href={href({ [param]: id })} scroll={false} className={cn('font-medium hover:text-primary hover:underline', className)}>
      {children}
    </Link>
  );
}

/** CSV export of the current filtered view. */
export function ExportButton({ dataset }: { dataset: string }) {
  const sp = useSearchParams();
  const qs = new URLSearchParams(sp.toString());
  qs.delete('page');
  qs.delete('job');
  return (
    <Button asChild variant="outline" size="sm" className="h-9 bg-card">
      <a href={`/api/export/${dataset}?${qs}`} download>
        <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
      </a>
    </Button>
  );
}
