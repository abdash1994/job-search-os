'use client';

import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { BarChart2, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { DailyJobCount, SourceBreakdown, SkillCount, FunnelStage, ScraperRun } from '@/types';

// Color palette for charts
const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4', '#84cc16', '#ef4444'];

interface AnalyticsData {
  dailyCounts: DailyJobCount[];
  sourceBreakdown: SourceBreakdown[];
  topSkills: SkillCount[];
  funnel: FunnelStage[];
  recentRuns: ScraperRun[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const [statusRes] = await Promise.all([
          fetch('/api/scraper/status'),
        ]);

        if (!statusRes.ok) throw new Error('Failed to load analytics');

        const statusData = await statusRes.json();

        // Derive analytics from scraper data + build mock analytics structure
        // In production these would be dedicated analytics endpoints
        const runs: ScraperRun[] = statusData.runs ?? [];

        // Build daily counts from scraper runs
        const dailyMap: Record<string, number> = {};
        runs.forEach((run: ScraperRun) => {
          const date = run.started_at.split('T')[0];
          dailyMap[date] = (dailyMap[date] ?? 0) + run.jobs_found;
        });
        const dailyCounts: DailyJobCount[] = Object.entries(dailyMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-30)
          .map(([date, count]) => ({ date, count }));

        // Source breakdown from runs
        const sourceMap: Record<string, number> = {};
        runs.forEach((run: ScraperRun) => {
          sourceMap[run.source] = (sourceMap[run.source] ?? 0) + run.jobs_found;
        });
        const sourceBreakdown: SourceBreakdown[] = Object.entries(sourceMap)
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count);

        setData({
          dailyCounts,
          sourceBreakdown,
          topSkills: [],
          funnel: statusData.funnel ?? [],
          recentRuns: runs.slice(0, 10),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

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

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white">Analytics</h1>
        <p className="text-xs text-slate-400">Market insights and scraper performance</p>
      </div>

      {/* Jobs scraped per day */}
      <ChartCard title="Jobs scraped — last 30 days">
        {data?.dailyCounts && data.dailyCounts.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.dailyCounts} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#64748b', fontSize: 10 }}
                tickFormatter={(d) => {
                  const parts = d.split('-');
                  return `${parts[1]}/${parts[2]}`;
                }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#e2e8f0' }}
                itemStyle={{ color: '#a5b4fc' }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                name="Jobs"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart />
        )}
      </ChartCard>

      {/* Source breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Jobs by source">
          {data?.sourceBreakdown && data.sourceBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={data.sourceBreakdown}
                  dataKey="count"
                  nameKey="source"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  innerRadius={40}
                >
                  {data.sourceBreakdown.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        {/* Application funnel */}
        <ChartCard title="Application funnel">
          {data?.funnel && data.funnel.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.funnel} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="stage" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Bar dataKey="count" name="Applications" radius={[4, 4, 0, 0]}>
                  {data.funnel.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Apply to jobs to see your funnel" />
          )}
        </ChartCard>
      </div>

      {/* Top skills */}
      {data?.topSkills && data.topSkills.length > 0 && (
        <ChartCard title="Top skills in job descriptions">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={data.topSkills.slice(0, 15)}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 60, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis
                type="category"
                dataKey="skill"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                width={55}
              />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Bar dataKey="count" name="Mentions" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Scraper health table */}
      <ChartCard title="Recent scraper runs">
        {data?.recentRuns && data.recentRuns.length > 0 ? (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left pb-2 font-medium">Source</th>
                  <th className="text-left pb-2 font-medium hidden sm:table-cell">Started</th>
                  <th className="text-right pb-2 font-medium">Found</th>
                  <th className="text-right pb-2 font-medium">New</th>
                  <th className="text-left pb-2 font-medium pl-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data.recentRuns.map((run) => (
                  <tr key={run.id} className="text-slate-300">
                    <td className="py-2 capitalize font-medium">{run.source}</td>
                    <td className="py-2 text-slate-400 hidden sm:table-cell">
                      {formatDate(run.started_at)}
                    </td>
                    <td className="py-2 text-right">{run.jobs_found}</td>
                    <td className="py-2 text-right text-success-400">+{run.jobs_new}</td>
                    <td className="py-2 pl-3">
                      <StatusDot status={run.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyChart message="No scraper runs yet" />
        )}
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function EmptyChart({ message = 'No data yet' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
      <BarChart2 className="w-4 h-4 mr-2" />
      {message}
    </div>
  );
}

function StatusDot({ status }: { status: ScraperRun['status'] }) {
  const styles = {
    success: 'bg-success-500',
    running: 'bg-primary-500 animate-pulse',
    failed: 'bg-danger-500',
    partial: 'bg-warning-500',
  };
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${styles[status]}`} />
      <span className="capitalize">{status}</span>
    </span>
  );
}
