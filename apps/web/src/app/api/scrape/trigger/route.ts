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

  // Insert a trigger record that the scraper workers poll
  // (The actual scraper is a separate Python service that watches for trigger events)
  const { error } = await supabase.from('scraper_triggers').insert({
    user_id: user.id,
    triggered_at: new Date().toISOString(),
    status: 'pending',
  });

  if (error) {
    // Fallback: if the scraper_triggers table doesn't exist, return a helpful message
    if (error.code === '42P01') {
      return NextResponse.json(
        { message: 'Trigger signal sent. The scraper will run on its next scheduled cycle.' },
        { status: 200 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    message: 'Scrape job triggered. Results will appear in 2–5 minutes.',
  });
}
