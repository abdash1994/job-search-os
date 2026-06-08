import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ScraperStatus, SiteStatus } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch recent scraper runs (last 7 days, max 100 rows)
  const { data: runs } = await supabase
    .from('scraper_runs')
    .select('*')
    .gte('started_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('started_at', { ascending: false })
    .limit(100);

  // Fetch proxy pool stats — use actual DB column names
  const { data: proxies } = await supabase
    .from('proxy_pool')
    .select('is_active, success_count, fail_count, last_checked');

  // Build per-site status from runs
  const siteMap = new Map<string, SiteStatus>();
  for (const run of runs ?? []) {
    const existing = siteMap.get(run.source);
    const isNewer = !existing || run.started_at > (existing.lastRun ?? '');

    if (isNewer) {
      const recentRuns = (runs ?? []).filter((r) => r.source === run.source).slice(0, 5);
      // 'error' and 'blocked' are both failure states
      const recentFailures = recentRuns.filter((r) => r.status === 'error' || r.status === 'blocked').length;

      let siteStatus: SiteStatus['status'] = 'unknown';
      if (recentFailures === 0) siteStatus = 'healthy';
      else if (recentFailures < 3) siteStatus = 'degraded';
      else siteStatus = 'down';

      siteMap.set(run.source, {
        source: run.source,
        lastSuccess: run.status === 'success' ? run.started_at : (existing?.lastSuccess ?? null),
        lastRun: run.started_at,
        status: siteStatus,
        failureCount: recentFailures,
        jobsLastRun: run.jobs_found ?? 0,
      });
    }
  }

  // Proxy aggregates — use `fail_count` and `last_checked` (actual DB columns)
  const proxyList = proxies ?? [];
  const activeProxies = proxyList.filter((p) => p.is_active);
  const totalSuccesses = proxyList.reduce((s, p) => s + (p.success_count ?? 0), 0);
  const totalAttempts = proxyList.reduce(
    (s, p) => s + (p.success_count ?? 0) + (p.fail_count ?? 0),
    0
  );
  const avgSuccessRate = totalAttempts > 0 ? totalSuccesses / totalAttempts : 0;
  const lastRefreshed = proxyList.reduce<string | null>((latest, p) => {
    if (!p.last_checked) return latest;
    if (!latest || p.last_checked > latest) return p.last_checked;
    return latest;
  }, null);

  const status: ScraperStatus = {
    runs: (runs ?? []),
    proxies: {
      active: activeProxies.length,
      total: proxyList.length,
      avgSuccessRate,
      lastRefreshed,
    },
    perSite: Object.fromEntries(siteMap),
  };

  return NextResponse.json(status);
}
