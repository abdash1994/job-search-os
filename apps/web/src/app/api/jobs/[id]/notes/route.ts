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

  const { data, error } = await supabase
    .from('user_jobs')
    .update({ notes: body.notes, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('job_id', jobId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
