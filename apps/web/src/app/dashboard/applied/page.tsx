'use client';

import { useState, useEffect } from 'react';
import { Briefcase, TrendingUp, CheckCircle, BarChart2 } from 'lucide-react';
import { StatusKanban } from '@/components/StatusKanban';
import { SkeletonCardList } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import type { UserJob, JobStatus } from '@/types';

export default function AppliedPage() {
  const [jobs, setJobs] = useState<UserJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApplied();
  }, []);

  const fetchApplied = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/jobs?show_applied=true&sort_by=date_scraped&limit=200');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      // Only show tracked jobs (not 'new')
      setJobs(data.jobs.filter((j: UserJob) => j.status !== 'new'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (jobId: string, status: JobStatus) => {
    const res = await fetch(`/api/jobs/${jobId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return;
    setJobs((prev) => prev.map((j) => (j.job_id === jobId ? { ...j, status } : j)));
  };

  const handleNotesUpdate = async (userJobId: string, notes: string) => {
    const job = jobs.find((j) => j.id === userJobId);
    if (!job) return;
    const res = await fetch(`/api/jobs/${job.job_id}/notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    if (!res.ok) return;
    setJobs((prev) => prev.map((j) => (j.id === userJobId ? { ...j, notes } : j)));
  };

  // Stats
  const applied = jobs.filter((j) => ['applied', 'interviewing', 'offer', 'rejected'].includes(j.status));
  const active = jobs.filter((j) => ['applied', 'interviewing', 'offer'].includes(j.status));
  const responded = jobs.filter((j) => ['interviewing', 'offer', 'rejected'].includes(j.status));
  const responseRate = applied.length > 0 ? Math.round((responded.length / applied.length) * 100) : 0;

  return (
    <div className="p-4 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-white">Application Tracker</h1>
        <p className="text-xs text-slate-400">Track your pipeline from saved to offer</p>
      </div>

      {/* Stats */}
      {!loading && jobs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            icon={<Briefcase className="w-4 h-4" />}
            label="Total applied"
            value={applied.length}
            color="text-primary-400"
          />
          <StatCard
            icon={<TrendingUp className="w-4 h-4" />}
            label="Active pipeline"
            value={active.length}
            color="text-warning-400"
          />
          <StatCard
            icon={<BarChart2 className="w-4 h-4" />}
            label="Response rate"
            value={`${responseRate}%`}
            color="text-success-400"
          />
        </div>
      )}

      {loading ? (
        <SkeletonCardList count={4} />
      ) : error ? (
        <div className="text-center py-8 text-danger-400 text-sm">{error}</div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<CheckCircle className="w-6 h-6" />}
          title="No tracked jobs yet"
          description="Save or apply to jobs from the job feed to start tracking your pipeline."
        />
      ) : (
        <StatusKanban
          jobs={jobs}
          onStatusChange={handleStatusChange}
          onNotesUpdate={handleNotesUpdate}
        />
      )}
    </div>
  );
}

function StatCard({
  icon, label, value, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
      <div className={`mb-1.5 ${color}`}>{icon}</div>
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}
