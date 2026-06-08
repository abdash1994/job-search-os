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
    .eq('id', user.id)
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

  // Start with existing profile data so we can merge JSONB fields
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('resume_parsed, preferences')
    .eq('id', user.id)
    .single();

  const currentResumeParsed: Record<string, unknown> = (existing?.resume_parsed as Record<string, unknown>) ?? {};
  const currentPreferences: Record<string, unknown> = (existing?.preferences as Record<string, unknown>) ?? {};

  const updateData: Record<string, unknown> = {
    id: user.id,
    updated_at: now,
  };

  // Resume text — store directly and extract skills into resume_parsed
  if (typeof body.resume_text === 'string' && body.resume_text.trim()) {
    updateData.resume_text = body.resume_text;
    const extractedSkills = extractSkills(body.resume_text);
    updateData.resume_parsed = {
      ...currentResumeParsed,
      skills: extractedSkills,
      parsed_at: now,
    };
  }

  // Preferences — merge into preferences JSONB column
  const updatedPreferences: Record<string, unknown> = { ...currentPreferences };
  if (Array.isArray(body.preferred_roles)) updatedPreferences.roles = body.preferred_roles;
  if (Array.isArray(body.preferred_locations)) updatedPreferences.locations = body.preferred_locations;
  if (typeof body.min_salary === 'number') updatedPreferences.salary_min = body.min_salary;
  if (Array.isArray(body.job_types)) updatedPreferences.job_types = body.job_types;

  if (Object.keys(updatedPreferences).length > 0) {
    updateData.preferences = updatedPreferences;
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(updateData, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
