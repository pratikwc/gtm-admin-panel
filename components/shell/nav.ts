import { Briefcase, Database, Globe2, Inbox, LayoutDashboard, Send, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
}

export const OVERVIEW: NavItem = {
  href: '/',
  label: 'Overview',
  short: 'Overview',
  description: 'The whole marketing funnel at a glance',
  icon: LayoutDashboard,
};

/** The marketing funnel, in order: who we can reach → who we reached → jobs → Jobs Duniya. */
export const SECTIONS: NavItem[] = [
  {
    href: '/data',
    label: 'Data space',
    short: 'Data space',
    description: 'Target companies and contacts in HubSpot, fed by Supabase',
    icon: Database,
  },
  {
    href: '/reached',
    label: 'Reached out',
    short: 'Reached out',
    description: 'Outbound email (Instantly) and outbound calls',
    icon: Send,
  },
  {
    href: '/outbound',
    label: 'Outbound jobs',
    short: 'Outbound jobs',
    description: 'LinkedIn jobs scraped for our target companies',
    icon: Briefcase,
  },
  {
    href: '/published',
    label: 'JD published',
    short: 'JD published',
    description: 'Jobs listed on Jobs Duniya and whether they are still live',
    icon: Globe2,
  },
  {
    href: '/applications',
    label: 'JD applications',
    short: 'JD applications',
    description: 'Candidates who applied through Jobs Duniya',
    icon: Inbox,
  },
];

/** Filters that carry across sections when you switch views. */
export const SHARED_PARAMS = ['range', 'market'] as const;
