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

  // Load user profile with resume
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('resume_text, skills')
    .eq('user_id', user.id)
    .single();

  if (!profile?.resume_text) {
    return NextResponse.json(
      { error: 'No resume uploaded. Upload a resume first.' },
      { status: 400 }
    );
  }

  const resumeText: string = profile.resume_text;
  const resumeSkills: string[] = profile.skills ?? extractSkills(resumeText);

  // Fetch jobs that this user hasn't scored yet (no user_jobs row with a score)
  const { data: userJobs } = await supabase
    .from('user_jobs')
    .select('job_id')
    .eq('user_id', user.id)
    .not('score', 'is', null);

  const alreadyScoredIds = new Set((userJobs ?? []).map((uj) => uj.job_id));

  // Get unscored jobs (limit 500 per batch to avoid timeout)
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, description')
    .not('id', 'in', `(${Array.from(alreadyScoredIds).join(',') || 'null'})`)
    .limit(500);

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ scored: 0, message: 'All jobs already scored.' });
  }

  // Score each job
  const upserts = jobs
    .filter((j) => j.description)
    .map((job) => {
      const result = scoreJob(resumeText, job.title, job.description!, resumeSkills);
      return {
        user_id: user.id,
        job_id: job.id,
        status: 'new' as const,
        score: result.overall,
        score_breakdown: result,
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
