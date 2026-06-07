import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { JobStatus } from '@/types';

const VALID_STATUSES: JobStatus[] = ['new', 'saved', 'applied', 'interviewing', 'offer', 'rejected'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const status = body?.status as JobStatus | undefined;

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  const jobId = params.id;

  const upsertData: Record<string, unknown> = {
    user_id: user.id,
    job_id: jobId,
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'applied') {
    upsertData.applied_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('user_jobs')
    .upsert(upsertData, { onConflict: 'user_id,job_id' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
