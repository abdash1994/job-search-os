import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, manifest.json, sw.js, icons/
     * - API routes that don't need auth (handled individually)
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/).*)',
  ],
};
