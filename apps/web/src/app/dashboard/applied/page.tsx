'use client';

import { useState, useEffect } from 'react';
import { Briefcase, TrendingUp, BarChart2, CheckCircle } from 'lucide-react';
import { StatusKanban } from '@/components/StatusKanban';
import { SkeletonCardList } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/useToast';
import type { UserJob, JobStatus } from '@/types';

const STATUS_LABELS: Record<string, string> = {
  saved: 'Saved', applied: 'Applied', interviewing: 'Interviewing',
  offer: 'Offer received!', rejected: 'Marked as rejected', new: 'Removed from tracker',
};

export default function AppliedPage() {
  const toast = useToast();
  const [jobs, setJobs] = useState<UserJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTracked();
  }, []);

  const fetchTracked = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Not authenticated');

      // Query user_jobs joined to jobs — all non-new tracked jobs
      const { data, error: dbError } = await supabase
        .from('user_jobs')
        .select('*, jobs(*)')
        .eq('user_id', user.id)
        .neq('status', 'new')
        .order('updated_at', { ascending: false });

      if (dbError) throw new Error(dbError.message);

      // Reshape: Supabase returns joined table as `jobs` key; rename to `job`
      const shaped: UserJob[] = (data ?? []).map((row) => {
        const { jobs: jobRow, ...rest } = row as typeof row & { jobs: UserJob['job'] };
        return { ...rest, job: jobRow } as UserJob;
      });

      setJobs(shaped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (jobId: string, status: JobStatus) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('user_jobs')
      .upsert(
        { user_id: user.id, job_id: jobId, status, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,job_id' }
      );

    if (error) { toast('Failed to update status', 'error'); return; }
    toast(STATUS_LABELS[status] ?? `Moved to ${status}`, status === 'offer' ? 'success' : 'info');
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

  // Stats computed from tracked jobs
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
