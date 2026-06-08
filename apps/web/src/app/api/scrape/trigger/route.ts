import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // The scraper runs on a GitHub Actions schedule every 6 hours.
  // We signal intent by inserting a `running` record into scraper_runs
  // that the GHA workflow can detect, or simply acknowledge the request.
  const { error } = await supabase.from('scraper_runs').insert({
    source: 'manual_trigger',
    started_at: new Date().toISOString(),
    status: 'running',
    jobs_found: 0,
    jobs_new: 0,
  });

  if (error) {
    // Graceful fallback — if insert fails for any reason, still return a
    // helpful message rather than a hard error, since the GHA schedule will
    // pick up the next cycle automatically.
    return NextResponse.json(
      {
        message:
          'Scraper is scheduled via GitHub Actions every 6 hours. Manual trigger signal could not be recorded, but the scraper will run on its next scheduled cycle.',
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    message:
      'Trigger signal recorded. The scraper runs via GitHub Actions on a 6-hour schedule — results will appear after the next run completes.',
  });
}
