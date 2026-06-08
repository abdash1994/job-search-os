import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/jobs/new-count — count jobs scraped since user's last feed visit
export async function GET() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ count: 0 });

  // Get last visit time
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('last_feed_visit')
    .eq('id', user.id)
    .single();

  const lastVisit = profile?.last_feed_visit ?? new Date(0).toISOString();

  // Count new jobs since last visit
  const { count } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .gt('scraped_at', lastVisit);

  // Update last visit timestamp
  await supabase
    .from('user_profiles')
    .upsert({ id: user.id, last_feed_visit: new Date().toISOString() }, { onConflict: 'id' });

  return NextResponse.json({ count: count ?? 0, since: lastVisit });
}
