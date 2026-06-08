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

  const keyword = searchParams.get('keyword') ?? '';
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
  const sortBy = (searchParams.get('sort_by') ?? 'scraped_at') as 'relevance_score' | 'date_posted' | 'scraped_at';
  const page = Math.max(0, Number(searchParams.get('page') ?? '0'));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '20')));
  const offset = page * limit;

  // When sorting by relevance we drive the query from user_jobs so we can
  // order on the DB-side relevance_score column and skip unscored rows.
  if (sortBy === 'relevance_score') {
    let ujQuery = supabase
      .from('user_jobs')
      .select('*, jobs!inner(*)', { count: 'exact' })
      .eq('user_id', user.id)
      .not('relevance_score', 'is', null)
      .order('relevance_score', { ascending: false, nullsFirst: false });

    if (!showApplied) {
      ujQuery = ujQuery.not('status', 'in', '(applied,interviewing,offer,rejected)');
    }
    if (minScore > 0) {
      ujQuery = ujQuery.gte('relevance_score', minScore);
    }

    // Apply job-level filters via the inner-joined jobs table
    if (sources.length > 0) ujQuery = ujQuery.in('jobs.source', sources);
    if (jobTypes.length > 0) ujQuery = ujQuery.in('jobs.job_type', jobTypes);
    if (country) ujQuery = ujQuery.ilike('jobs.country', `%${country}%`);
    if (salaryMin !== null) ujQuery = ujQuery.gte('jobs.salary_min', salaryMin);
    if (salaryMax !== null) ujQuery = ujQuery.lte('jobs.salary_max', salaryMax);
    if (postedWithinDays) {
      const since = new Date();
      since.setDate(since.getDate() - postedWithinDays);
      ujQuery = ujQuery.gte('jobs.posted_at', since.toISOString());
    }
    if (keyword) {
      ujQuery = ujQuery.or(
        `jobs.title.ilike.%${keyword}%,jobs.company.ilike.%${keyword}%,jobs.description.ilike.%${keyword}%`
      );
    }

    ujQuery = ujQuery.range(offset, offset + limit - 1);

    const { data: userJobs, error, count } = await ujQuery;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Reshape: the joined jobs row comes back as `jobs` key
    const merged = (userJobs ?? []).map((uj) => {
      const { jobs: job, ...rest } = uj as typeof uj & { jobs: Record<string, unknown> };
      return { ...rest, job };
    });

    return NextResponse.json({
      jobs: merged,
      total: count ?? 0,
      page,
      limit,
      hasMore: offset + limit < (count ?? 0),
    });
  }

  // Date-based sorts: query jobs directly then merge user_jobs
  let query = supabase
    .from('jobs')
    .select('*', { count: 'exact' })
    .eq('is_active', true);

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

  if (keyword) {
    query = query.or(`title.ilike.%${keyword}%,company.ilike.%${keyword}%,description.ilike.%${keyword}%`);
  }

  if (sortBy === 'date_posted') {
    query = query.order('posted_at', { ascending: false, nullsFirst: false });
  } else {
    query = query.order('scraped_at', { ascending: false });
  }

  // Fetch a larger window so we still have enough rows after filtering applied
  // jobs client-side. We'll slice to the requested limit afterwards.
  const fetchLimit = showApplied ? limit : limit + 50;
  query = query.range(offset, offset + fetchLimit - 1);

  const { data: rawJobs, error: jobsError, count } = await query;

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 });
  }

  const jobs = rawJobs ?? [];

  // Fetch user_jobs rows for these job IDs so we know per-user status/scores
  const jobIds = jobs.map((j) => j.id);
  const { data: userJobs } = jobIds.length
    ? await supabase
        .from('user_jobs')
        .select('*')
        .eq('user_id', user.id)
        .in('job_id', jobIds)
    : { data: [] };

  const userJobMap = new Map((userJobs ?? []).map((uj) => [uj.job_id, uj]));

  // Merge: create a synthetic UserJob for jobs without a user_jobs row
  const mergedJobs = jobs
    .map((job) => {
      const uj = userJobMap.get(job.id);
      if (uj) {
        return { ...uj, job };
      }
      return {
        id: `${user.id}:${job.id}`,
        user_id: user.id,
        job_id: job.id,
        status: 'new' as const,
        relevance_score: null,
        relevance_breakdown: null,
        notes: null,
        applied_at: null,
        created_at: job.scraped_at,
        updated_at: job.scraped_at,
        job,
      };
    })
    .filter((j) => {
      if (!showApplied && ['applied', 'interviewing', 'offer', 'rejected'].includes(j.status)) {
        return false;
      }
      if (minScore > 0 && (j.relevance_score === null || j.relevance_score < minScore)) {
        return false;
      }
      return true;
    })
    .slice(0, limit);

  return NextResponse.json({
    jobs: mergedJobs,
    total: count ?? 0,
    page,
    limit,
    hasMore: offset + limit < (count ?? 0),
  });
}
