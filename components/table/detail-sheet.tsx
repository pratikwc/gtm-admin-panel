'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

/**
 * Side drawer whose open state lives in the URL (?job=...), so a detail view
 * can be linked, and the page underneath never changes. Content is rendered
 * on the server and passed in as children.
 */
export function DetailSheet({
  param = 'job',
  title,
  subtitle,
  children,
}: {
  param?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const close = () => {
    const next = new URLSearchParams(sp.toString());
    next.delete(param);
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  };
  return (
    <Sheet open onOpenChange={open => !open && close()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pr-6 text-left">
          <SheetTitle className="leading-snug">{title}</SheetTitle>
          {subtitle && <SheetDescription>{subtitle}</SheetDescription>}
        </SheetHeader>
        <div className="mt-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export function DetailGrid({ items }: { items: [label: string, value: React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2.5 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
