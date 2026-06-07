import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractSkills } from '@/lib/tfidf';

export const dynamic = 'force-dynamic';

/** GET — return current user profile */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json(null);
  }

  return NextResponse.json(profile);
}

/** POST — save resume text and/or preferences, trigger async re-score */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const now = new Date().toISOString();

  const updateData: Record<string, unknown> = {
    user_id: user.id,
    updated_at: now,
  };

  if (typeof body.resume_text === 'string' && body.resume_text.trim()) {
    updateData.resume_text = body.resume_text;
    updateData.resume_uploaded_at = now;
    // Extract and store skills from resume
    updateData.skills = extractSkills(body.resume_text);
  }

  if (Array.isArray(body.preferred_roles)) updateData.preferred_roles = body.preferred_roles;
  if (Array.isArray(body.preferred_locations)) updateData.preferred_locations = body.preferred_locations;
  if (typeof body.min_salary === 'number') updateData.min_salary = body.min_salary;
  if (Array.isArray(body.job_types)) updateData.job_types = body.job_types;

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(updateData, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
