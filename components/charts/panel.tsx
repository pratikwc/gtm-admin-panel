import { cn } from '@/lib/utils';

export function Panel({
  title,
  description,
  action,
  scope,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  /** Shown as a small chip by the title when the panel ignores a filter, e.g. "Now" or "All markets". */
  scope?: string | null;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-2xl border bg-card', className)}>
      <header className="flex items-start justify-between gap-3 px-6 pb-4 pt-5">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-medium leading-tight tracking-tight">
            {title}
            {scope && (
              <span className="ml-2 inline-block translate-y-[-2px] rounded-full border px-2 py-0.5 align-middle font-sans text-[11px] font-medium tracking-normal text-muted-foreground">
                {scope}
              </span>
            )}
          </h2>
          {description && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      <div className={cn('flex-1 px-6 pb-6', bodyClassName)}>{children}</div>
    </section>
  );
}

export function SectionHeader({ title, description, children }: { title: string; description: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[32px] font-bold leading-tight tracking-tight">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full min-h-[120px] place-items-center rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
