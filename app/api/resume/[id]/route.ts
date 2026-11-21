import { NextResponse } from 'next/server';
import { jdStorage } from '@/lib/db/jd';
import { getApplicationResumePath } from '@/lib/queries/applications';
import { requireViewer } from '@/lib/session';

export const dynamic = 'force-dynamic';

function message(status: number, title: string, body: string) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 16px;color:#0b0b0b;background:#f9f9f7">
<h1 style="font-size:20px">${title}</h1><p style="color:#52514e;line-height:1.5">${body}</p></body>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/** Redirect to a 10-minute signed URL for an applicant's resume in the private `resumes` bucket. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireViewer())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const path = await getApplicationResumePath(id);
  if (!path) return message(404, 'No resume', 'This application has no resume file attached.');

  const { data, error } = await jdStorage().from('resumes').createSignedUrl(path, 600);
  if (error || !data?.signedUrl) {
    const quota = /egress_quota|restricted/i.test(error?.message ?? '');
    return message(
      502,
      quota ? 'Jobs Duniya storage is restricted' : 'Could not open the resume',
      quota
        ? 'Supabase has restricted the Jobs Duniya project because it exceeded its egress quota, so files can’t be downloaded until the plan is upgraded or the spend cap is lifted.'
        : `Supabase Storage returned an error: ${(error?.message ?? 'unknown').replace(/[<>&]/g, '')}`,
    );
  }
  return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'no-store' } });
}
