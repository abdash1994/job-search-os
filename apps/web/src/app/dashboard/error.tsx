'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console in development; wire up to Sentry/Datadog in production
    console.error('[Dashboard Error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-5">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-full bg-danger-500/10 border border-danger-500/20 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-danger-400" />
          </div>
        </div>

        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-white">Something went wrong</h2>
          <p className="text-sm text-slate-400">
            An unexpected error occurred while loading this page.
          </p>
          {error.message && (
            <p className="text-xs text-slate-500 bg-slate-800 rounded-lg px-3 py-2 mt-2 font-mono text-left break-all">
              {error.message}
            </p>
          )}
          {error.digest && (
            <p className="text-xs text-slate-600 mt-1">Error ID: {error.digest}</p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Try again
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
