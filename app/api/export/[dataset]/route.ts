import { NextResponse, type NextRequest } from 'next/server';
import { format } from 'date-fns';
import { parseFilters } from '@/lib/filters';
import { toCsv } from '@/lib/csv';
import { requireViewer } from '@/lib/session';
import { exportOutboundCompanies, exportOutboundJobs } from '@/lib/queries/outbound';
import { exportPublishedJobs } from '@/lib/queries/published';
import { exportApplications } from '@/lib/queries/applications';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DATASETS = {
  'outbound-jobs': exportOutboundJobs,
  'outbound-companies': exportOutboundCompanies,
  'published-jobs': exportPublishedJobs,
  applications: exportApplications,
} as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ dataset: string }> }) {
  if (!(await requireViewer())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { dataset } = await params;
  const fn = DATASETS[dataset as keyof typeof DATASETS];
  if (!fn) return NextResponse.json({ error: 'unknown dataset' }, { status: 404 });

  const f = parseFilters(Object.fromEntries(req.nextUrl.searchParams));
  const rows = (await fn(f)) as Record<string, unknown>[];
  const name = `${dataset}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`;
  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
