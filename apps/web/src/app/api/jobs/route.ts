import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  const sources = searchParams.getAll('source[]');
  const jobTypes = searchParams.getAll('job_type[]');
  const country = searchParams.get('country') ?? '';
  const salaryMin = searchParams.get('salary_min') ? Number(searchParams.get('salary_min')) : null;
  const salaryMax = searchParams.get('salary_max') ? Number(searchParams.get('salary_max')) : null;
  const postedWithinDays = searchParams.get('posted_within_days')
    ? Number(searchParams.get('posted_within_days'))
    : null;
  const minScore = searchParams.get('min_score') ? Number(searchParams.get('min_score')) : 0;
  const showApplied = searchParams.get('show_applied') === 'true';
  const sortBy = (searchParams.get('sort_by') ?? 'date_scraped') as 'score' | 'date_posted' | 'date_scraped';
  const page = Math.max(0, Number(searchParams.get('page') ?? '0'));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '20')));
  const offset = page * limit;

  // Build jobs query with all filters
  let query = supabase
    .from('jobs')
    .select('*', { count: 'exact' });

  if (sources.length > 0) query = query.in('source', sources);
  if (jobTypes.length > 0) query = query.in('job_type', jobTypes);
  if (country) query = query.ilike('country', `%${country}%`);
  if (salaryMin !== null) query = query.gte('salary_min', salaryMin);
  if (salaryMax !== null) query = query.lte('salary_max', salaryMax);

  if (postedWithinDays) {
    const since = new Date();
    since.setDate(since.getDate() - postedWithinDays);
    query = query.gte('posted_at', since.toISOString());
  }

  // Sort by date fields on DB side
  if (sortBy === 'date_posted') {
    query = query.order('posted_at', { ascending: false, nullsFirst: false });
  } else {
    query = query.order('scraped_at', { ascending: false });
  }

  query = query.range(offset, offset + limit - 1);

  const { data: rawJobs, error: jobsError, count } = await query;

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 });
  }

  const jobs = rawJobs ?? [];

  // Fetch user_jobs for these job IDs to get per-user status/scores
  const jobIds = jobs.map((j) => j.id);
  const { data: userJobs } = await supabase
    .from('user_jobs')
    .select('*')
    .eq('user_id', user.id)
    .in('job_id', jobIds);

  const userJobMap = new Map((userJobs ?? []).map((uj) => [uj.job_id, uj]));

  // Merge: create synthetic UserJob for jobs without a user_jobs row
  const mergedJobs = jobs
    .map((job) => {
      const uj = userJobMap.get(job.id);
      if (uj) {
        return { ...uj, job };
      }
      // Default row for untracked job
      return {
        id: `${user.id}:${job.id}`,
        user_id: user.id,
        job_id: job.id,
        status: 'new' as const,
        score: null,
        score_breakdown: null,
        notes: null,
        applied_at: null,
        created_at: job.created_at,
        updated_at: job.scraped_at,
        job,
      };
    })
    .filter((j) => {
      if (!showApplied && ['applied', 'interviewing', 'offer', 'rejected'].includes(j.status)) {
        return false;
      }
      if (minScore > 0 && (j.score === null || j.score < minScore)) return false;
      return true;
    });

  // If sort is by score, sort in-memory after merge
  if (sortBy === 'score') {
    mergedJobs.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }

  return NextResponse.json({
    jobs: mergedJobs,
    total: count ?? 0,
    page,
    limit,
    hasMore: offset + limit < (count ?? 0),
  });
}
