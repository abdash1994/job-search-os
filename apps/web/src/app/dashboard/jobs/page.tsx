'use client';

import { useState, useEffect, useCallback } from 'react';
import { SlidersHorizontal, RefreshCw, Search } from 'lucide-react';
import { JobCard } from '@/components/JobCard';
import { FilterPanel } from '@/components/FilterPanel';
import { SkeletonCardList } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/Button';
import type { UserJob, JobFilters, JobStatus } from '@/types';

const DEFAULT_FILTERS: JobFilters = {
  sources: [],
  jobTypes: [],
  country: '',
  salaryMin: 0,
  salaryMax: 300000,
  postedWithinDays: null,
  minScore: 0,
  showApplied: false,
  sortBy: 'date_scraped',
  page: 0,
};

const PAGE_SIZE = 20;

export default function JobsPage() {
  const [jobs, setJobs] = useState<UserJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<JobFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [hasResume, setHasResume] = useState(false);

  const fetchJobs = useCallback(async (f: JobFilters, append = false) => {
    const params = new URLSearchParams();
    if (f.sources.length) f.sources.forEach((s) => params.append('source[]', s));
    if (f.jobTypes.length) f.jobTypes.forEach((t) => params.append('job_type[]', t));
    if (f.country) params.set('country', f.country);
    if (f.salaryMin > 0) params.set('salary_min', String(f.salaryMin));
    if (f.salaryMax < 300000) params.set('salary_max', String(f.salaryMax));
    if (f.postedWithinDays) params.set('posted_within_days', String(f.postedWithinDays));
    if (f.minScore > 0) params.set('min_score', String(f.minScore));
    params.set('show_applied', String(f.showApplied));
    params.set('sort_by', f.sortBy);
    params.set('page', String(f.page));
    params.set('limit', String(PAGE_SIZE));

    try {
      const res = await fetch(`/api/jobs?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch jobs');
      const data = await res.json();

      setJobs((prev) => (append ? [...prev, ...data.jobs] : data.jobs));
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    }
  }, []);

  // Initial load
  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchJobs(DEFAULT_FILTERS),
      fetch('/api/resume').then((r) => r.json()).then((d) => {
        if (d?.resume_text) {
          setHasResume(true);
          setFilters((f) => ({ ...f, sortBy: 'score' }));
        }
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [fetchJobs]);

  const handleFilterChange = useCallback((newFilters: JobFilters) => {
    setFilters(newFilters);
    setLoading(true);
    setError(null);
    fetchJobs({ ...newFilters, page: 0 }).finally(() => setLoading(false));
  }, [fetchJobs]);

  const handleLoadMore = async () => {
    const nextPage = filters.page + 1;
    setLoadingMore(true);
    await fetchJobs({ ...filters, page: nextPage }, true);
    setFilters((f) => ({ ...f, page: nextPage }));
    setLoadingMore(false);
  };

  const handleStatusChange = async (jobId: string, status: JobStatus) => {
    const res = await fetch(`/api/jobs/${jobId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return;

    setJobs((prev) =>
      prev.map((j) =>
        j.job_id === jobId ? { ...j, status } : j
      )
    );
  };

  const hasMore = jobs.length < total;

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Filter panel (desktop sidebar + mobile drawer) */}
      <FilterPanel
        filters={filters}
        onChange={handleFilterChange}
        hasResume={hasResume}
        isMobileOpen={showFilters}
        onMobileClose={() => setShowFilters(false)}
      />

      {/* Job list */}
      <div className="flex-1 min-w-0 p-4 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-white">Remote Jobs</h1>
            <p className="text-xs text-slate-400">
              {loading ? 'Loading…' : `${total.toLocaleString()} jobs found`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setLoading(true);
                fetchJobs(filters).finally(() => setLoading(false));
              }}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowFilters(true)}
              className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-sm hover:bg-slate-700 transition"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <SkeletonCardList count={6} />
        ) : error ? (
          <div className="py-8 text-center text-danger-400 text-sm">{error}</div>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={<Search className="w-6 h-6" />}
            title="No jobs found"
            description="Try adjusting your filters or check back later when new jobs are scraped."
            action={
              <Button variant="secondary" size="sm" onClick={() => handleFilterChange(DEFAULT_FILTERS)}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="space-y-3 animate-fade-in">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onStatusChange={handleStatusChange} />
            ))}

            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="secondary"
                  loading={loadingMore}
                  onClick={handleLoadMore}
                >
                  Load more ({total - jobs.length} remaining)
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
