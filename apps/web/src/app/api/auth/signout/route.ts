import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = createClient();
  await supabase.auth.signOut();

  // Redirect back to login using the request's origin
  const origin = request.nextUrl.origin;
  return NextResponse.redirect(new URL('/login', origin));
}
