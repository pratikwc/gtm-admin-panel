import { Briefcase, Globe2, Inbox, LayoutDashboard, type LucideIcon } from 'lucide-react';

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
  description: 'The whole pipeline, from scrape to application',
  icon: LayoutDashboard,
};

/** The three views the panel toggles between. */
export const SECTIONS: NavItem[] = [
  {
    href: '/outbound',
    label: 'Outbound Jobs Collection',
    short: 'Outbound jobs',
    description: 'LinkedIn jobs scraped for our target companies (GTM database)',
    icon: Briefcase,
  },
  {
    href: '/published',
    label: 'JD Jobs Published',
    short: 'JD published',
    description: 'Jobs listed on Jobs Duniya and whether they are still live',
    icon: Globe2,
  },
  {
    href: '/applications',
    label: 'JD Application Collection',
    short: 'JD applications',
    description: 'Candidates who submitted the Jobs Duniya form',
    icon: Inbox,
  },
];

/** Filters that carry across sections when you switch views. */
export const SHARED_PARAMS = ['range', 'market'] as const;
