import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// PATCH /api/jobs/[id]/view — mark a job as viewed (called when user clicks View)
export async function PATCH(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('user_jobs')
    .upsert(
      { user_id: user.id, job_id: params.id, viewed_at: new Date().toISOString() },
      { onConflict: 'user_id,job_id' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
