import { SectionHeader } from '@/components/charts/panel';
import { SubTabs } from '@/components/shell/subtabs';

export default function ReachedOutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionHeader
        title="Reached out"
        description="Everyone we have contacted, by channel: what went out, to whom, where, and what came back."
      />
      <SubTabs
        tabs={[
          { href: '/reached', label: 'Outbound email' },
          { href: '/reached/calls', label: 'Outbound calls', badge: 'Coming soon' },
        ]}
      />
      {children}
    </>
  );
}
