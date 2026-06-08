'use client';

import { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw, Loader2, AlertTriangle, Play, Shield } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import type { ScraperStatus, ScraperRun } from '@/types';

export default function StatusPage() {
  const [data, setData] = useState<ScraperStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/scraper/status');
      if (!res.ok) throw new Error('Failed to load status');
      const d = await res.json();
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleTrigger = async () => {
    setShowConfirm(false);
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await fetch('/api/scrape/trigger', { method: 'POST' });
      if (!res.ok) throw new Error('Trigger failed');
      const d = await res.json();
      setTriggerResult(d.message ?? 'Scrape job triggered successfully.');
      setTimeout(fetchStatus, 3000);
    } catch (err) {
      setTriggerResult(err instanceof Error ? err.message : 'Trigger failed');
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-center text-danger-400 text-sm">{error}</div>;
  }

  const siteList = Object.values(data?.perSite ?? {});

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">System Status</h1>
          <p className="text-xs text-slate-400">Scraper health and proxy pool</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchStatus}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Button
            variant="primary"
            size="sm"
            loading={triggering}
            leftIcon={<Play className="w-3.5 h-3.5" />}
            onClick={() => setShowConfirm(true)}
          >
            Trigger scrape
          </Button>
        </div>
      </div>

      {triggerResult && (
        <div className="px-4 py-3 bg-success-500/10 border border-success-500/20 rounded-xl text-success-400 text-sm">
          {triggerResult}
        </div>
      )}

      {/* Proxy pool */}
      <section>
        <h2 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary-400" />
          Proxy pool
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <ProxyStat label="Active proxies" value={data?.proxies.active ?? 0} />
          <ProxyStat label="Total proxies" value={data?.proxies.total ?? 0} />
          <ProxyStat
            label="Avg success rate"
            value={`${Math.round((data?.proxies.avgSuccessRate ?? 0) * 100)}%`}
          />
        </div>
        {data?.proxies.lastRefreshed && (
          <p className="text-xs text-slate-500 mt-2">
            Last refreshed: {formatDate(data.proxies.lastRefreshed)}
          </p>
        )}
      </section>

      {/* Per-site status cards */}
      <section>
        <h2 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary-400" />
          Site status
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {siteList.length > 0
            ? siteList.map((site) => <SiteCard key={site.source} site={site} />)
            : <p className="text-sm text-slate-500 col-span-2">No site data yet.</p>}
        </div>
      </section>

      {/* Scraper run log */}
      <section>
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Recent scraper runs</h2>
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {data?.runs && data.runs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/80 border-b border-slate-800">
                  <tr className="text-slate-500">
                    <th className="text-left px-4 py-3 font-medium">Source</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Started</th>
                    <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Duration</th>
                    <th className="text-right px-4 py-3 font-medium">Found</th>
                    <th className="text-right px-4 py-3 font-medium">New</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Proxy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {data.runs.slice(0, 30).map((run) => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center text-slate-500 text-sm">No scraper runs yet</div>
          )}
        </div>
      </section>

      {/* Confirm trigger modal */}
      <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="Trigger scraper?">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-warning-500/10 border border-warning-500/20 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-warning-400 shrink-0 mt-0.5" />
            <p className="text-sm text-slate-300">
              This will start scraping all configured job boards immediately. Use sparingly to avoid rate limits.
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" leftIcon={<Play className="w-3.5 h-3.5" />} onClick={handleTrigger}>
              Yes, trigger now
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ProxyStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

function SiteCard({ site }: { site: ScraperStatus['perSite'][string] }) {
  const statusConfig = {
    healthy: { color: 'text-success-400', bg: 'bg-success-500', label: 'Healthy' },
    degraded: { color: 'text-warning-400', bg: 'bg-warning-500', label: 'Degraded' },
    down: { color: 'text-danger-400', bg: 'bg-danger-500', label: 'Down' },
    unknown: { color: 'text-slate-400', bg: 'bg-slate-500', label: 'Unknown' },
  };
  const cfg = statusConfig[site.status] ?? statusConfig.unknown;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white capitalize">{site.source}</span>
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <span className={cn('w-2 h-2 rounded-full', cfg.bg)} />
          <span className={cfg.color}>{cfg.label}</span>
        </span>
      </div>
      <div className="text-xs text-slate-400 space-y-0.5">
        <p>Last success: {site.lastSuccess ? formatDate(site.lastSuccess) : 'Never'}</p>
        <p>Last run: {site.lastRun ? formatDate(site.lastRun) : 'Never'}</p>
        {site.failureCount > 0 && (
          <p className="text-danger-400">Failures: {site.failureCount}</p>
        )}
        <p>Jobs last run: {site.jobsLastRun}</p>
      </div>
    </div>
  );
}

function RunRow({ run }: { run: ScraperRun }) {
  const statusBadge: Record<string, React.ReactNode> = {
    success: <Badge color="success" dot>Success</Badge>,
    running: <Badge color="primary" dot>Running</Badge>,
    error: <Badge color="danger" dot>Error</Badge>,
    blocked: <Badge color="warning" dot>Blocked</Badge>,
  };

  // duration_ms from DB — convert to a human-readable string
  const durationSec = Math.round((run.duration_ms ?? 0) / 1000);
  const duration = run.duration_ms
    ? durationSec < 60
      ? `${durationSec}s`
      : `${Math.round(durationSec / 60)}m`
    : '—';

  // Guard against null started_at
  const startedLabel = run.started_at?.split('T')[0] || 'Unknown';

  return (
    <tr className="text-slate-300 hover:bg-slate-800/30 transition">
      <td className="px-4 py-2.5 font-medium capitalize">{run.source}</td>
      <td className="px-4 py-2.5 text-slate-400 hidden md:table-cell">{startedLabel}</td>
      <td className="px-4 py-2.5 text-slate-400 hidden sm:table-cell">{duration}</td>
      <td className="px-4 py-2.5 text-right">{run.jobs_found}</td>
      <td className="px-4 py-2.5 text-right text-success-400">+{run.jobs_new}</td>
      <td className="px-4 py-2.5">{statusBadge[run.status] ?? statusBadge['error']}</td>
      <td className="px-4 py-2.5 text-slate-500 hidden lg:table-cell truncate max-w-[100px]">
        {run.proxy_used ?? '—'}
      </td>
    </tr>
  );
}
