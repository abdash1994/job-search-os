import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
  if (body === null || typeof body.notes !== 'string') {
    return NextResponse.json({ error: 'notes field (string) is required' }, { status: 400 });
  }

  const jobId = params.id;
  const now = new Date().toISOString();

  // Use upsert so the row is created if it doesn't exist yet
  const { data, error } = await supabase
    .from('user_jobs')
    .upsert(
      {
        user_id: user.id,
        job_id: jobId,
        notes: body.notes,
        status: 'saved',
        updated_at: now,
      },
      { onConflict: 'user_id,job_id' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
