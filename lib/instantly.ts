import 'server-only';
import { env } from './env';

/** Read-only Instantly API v2 client. Only GET requests are made. */

const BASE = 'https://api.instantly.ai/api/v2';

export class InstantlyError extends Error {
  constructor(public status: number | null, message: string) {
    super(message);
  }
}

export async function instantly<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
  const url = `${BASE}${path}${qs.size ? `?${qs}` : ''}`;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${env.instantlyKey()}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new InstantlyError(null, e instanceof Error ? e.message : 'Network error');
    }
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    const text = await res.text().catch(() => '');
    let message = text.slice(0, 300);
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? message;
    } catch {}
    throw new InstantlyError(res.status, `Instantly ${res.status}: ${message}`);
  }
}

/** Follow `next_starting_after` until the list is exhausted (capped for safety). */
export async function instantlyAll<T>(path: string, params: Record<string, string | number | undefined> = {}, maxPages = 50): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const r = await instantly<{ items: T[]; next_starting_after?: string }>(path, { ...params, limit: 100, starting_after: cursor });
    out.push(...r.items);
    if (!r.next_starting_after || !r.items.length) break;
    cursor = r.next_starting_after;
  }
  return out;
}

export interface InstantlyCampaign {
  id: string;
  name: string;
  status: number;
  timestamp_created: string;
  timestamp_updated: string;
  daily_limit?: number | null;
  open_tracking?: boolean;
  link_tracking?: boolean;
  email_list?: string[];
}

export interface InstantlyCampaignAnalytics {
  campaign_id: string;
  campaign_name: string;
  campaign_status: number;
  leads_count: number;
  contacted_count: number;
  new_leads_contacted_count: number;
  emails_sent_count: number;
  open_count_unique: number;
  reply_count_unique: number;
  reply_count_automatic_unique?: number;
  link_click_count_unique: number;
  bounced_count: number;
  unsubscribed_count: number;
  completed_count: number;
  total_opportunities: number;
  total_opportunity_value: number;
}

export interface InstantlyDaily {
  date: string;
  sent: number;
  contacted: number;
  new_leads_contacted: number;
  unique_opened: number;
  unique_replies: number;
  unique_replies_automatic?: number;
  unique_clicks: number;
  unique_opportunities?: number;
}

export interface InstantlyStep {
  step: string | null;
  variant: string | null;
  sent: number;
  unique_opened: number;
  unique_replies: number;
  unique_replies_automatic?: number;
  unique_clicks: number;
}

export interface InstantlyAccount {
  email: string;
  status: number;
  warmup_status: number;
  daily_limit: number | null;
  stat_warmup_score: number | null;
  setup_pending?: boolean;
  timestamp_created: string;
}
