'use client';

import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface RunSummary {
  status: 'running' | 'success' | 'blocked' | 'error';
  started_at: string;
  completed_at: string | null;
  jobs_new: number;
}

interface StatusData {
  runs: RunSummary[];
}

const SCRAPE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function nextRunIn(lastStartedAt: string): string {
  const next = new Date(lastStartedAt).getTime() + SCRAPE_INTERVAL_MS;
  const diff = next - Date.now();
  if (diff <= 0) return 'any moment';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

export function ScraperStatusPill() {
  const [data, setData] = useState<StatusData | null>(null);

  const refresh = () => {
    fetch('/api/scraper/status')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000); // poll every 30s
    return () => clearInterval(interval);
  }, []);

  if (!data || !data.runs?.length) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-400">
        <Clock className="w-3 h-3" />
        <span>Scraper idle</span>
      </div>
    );
  }

  const latest = data.runs[0];
  const isRunning = latest.status === 'running';
  const isFailed = latest.status === 'error' || latest.status === 'blocked';

  if (isRunning) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-500/10 border border-primary-500/30 text-xs text-primary-400">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Scraping now…</span>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-danger-500/10 border border-danger-500/30 text-xs text-danger-400"
        title={`Last run ${latest.started_at ? timeAgo(latest.started_at) : ''}`}>
        <AlertCircle className="w-3 h-3" />
        <span>Last scrape failed</span>
      </div>
    );
  }

  // Success
  const updatedAgo = latest.completed_at ? timeAgo(latest.completed_at) : '—';
  const nextIn = latest.started_at ? nextRunIn(latest.started_at) : '—';

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-500/10 border border-success-500/30 text-xs text-success-400 cursor-default"
      title={`+${latest.jobs_new ?? 0} new jobs · Next run in ${nextIn}`}
    >
      <CheckCircle2 className="w-3 h-3" />
      <span>Updated {updatedAgo}</span>
      <span className="text-success-500/60">·</span>
      <Clock className="w-3 h-3 text-success-500/60" />
      <span className="text-success-500/70">in {nextIn}</span>
    </div>
  );
}
