import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scoreJob, extractSkills } from '@/lib/tfidf';

export const dynamic = 'force-dynamic';
// Scoring can take a while — allow up to 60 s on Vercel
export const maxDuration = 60;

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Load user profile — PK is `id`, skills live inside resume_parsed JSONB
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('resume_text, resume_parsed')
    .eq('id', user.id)
    .single();

  if (!profile?.resume_text) {
    return NextResponse.json(
      { error: 'No resume uploaded. Upload a resume first.' },
      { status: 400 }
    );
  }

  const resumeText: string = profile.resume_text;
  const parsedResume = (profile.resume_parsed as Record<string, unknown>) ?? {};
  const resumeSkills: string[] =
    Array.isArray(parsedResume.skills)
      ? (parsedResume.skills as string[])
      : extractSkills(resumeText);

  // Find job_ids that already have a relevance_score recorded
  const { data: scoredRows } = await supabase
    .from('user_jobs')
    .select('job_id')
    .eq('user_id', user.id)
    .not('relevance_score', 'is', null);

  const alreadyScoredIds = (scoredRows ?? []).map((uj) => uj.job_id);

  // Build the unscored jobs query
  let jobsQuery = supabase
    .from('jobs')
    .select('id, title, description')
    .eq('is_active', true)
    .limit(500);

  // Only add the exclusion filter when there are already-scored jobs to exclude
  if (alreadyScoredIds.length > 0) {
    jobsQuery = jobsQuery.not('id', 'in', `(${alreadyScoredIds.join(',')})`);
  }

  const { data: jobs } = await jobsQuery;

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ scored: 0, message: 'All jobs already scored.' });
  }

  // Score each job that has a description
  const upserts = jobs
    .filter((j) => j.description)
    .map((job) => {
      const result = scoreJob(resumeText, job.title, job.description!, resumeSkills);
      return {
        user_id: user.id,
        job_id: job.id,
        status: 'new' as const,
        relevance_score: result.overall,
        relevance_breakdown: result,
        updated_at: new Date().toISOString(),
      };
    });

  // Batch upsert in chunks of 100 to avoid payload limits
  const CHUNK = 100;
  for (let i = 0; i < upserts.length; i += CHUNK) {
    const chunk = upserts.slice(i, i + CHUNK);
    await supabase
      .from('user_jobs')
      .upsert(chunk, { onConflict: 'user_id,job_id', ignoreDuplicates: false });
  }

  return NextResponse.json({ scored: upserts.length });
}
