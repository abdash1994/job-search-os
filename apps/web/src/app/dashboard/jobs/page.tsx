'use client';

import { useState, useEffect, useCallback } from 'react';
import { SlidersHorizontal, RefreshCw, Search, Bell, X } from 'lucide-react';
import { JobCard } from '@/components/JobCard';
import { FilterPanel, countActiveFilters, SOURCE_LABELS } from '@/components/FilterPanel';
import { SkeletonCardList } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/Button';
import type { UserJob, JobFilters, JobStatus, JobType } from '@/types';

const JOB_TYPE_LABELS: Record<JobType, string> = {
  'full-time': 'Full-time',
  'part-time': 'Part-time',
  contract: 'Contract',
  freelance: 'Freelance',
  internship: 'Internship',
};

const POSTED_WITHIN_LABELS: Record<number, string> = {
  1: 'Last 24h',
  3: 'Last 3 days',
  7: 'Last week',
  14: 'Last 2 weeks',
};

const DEFAULT_FILTERS: JobFilters = {
  keyword: '',
  sources: [],
  jobTypes: [],
  country: '',
  salaryMin: 0,
  salaryMax: 300000,
  postedWithinDays: null,
  minScore: 0,
  showApplied: false,
  sortBy: 'scraped_at',
  page: 0,
};

const PAGE_SIZE = 20;

/** Inline chip component for active filter tags. */
function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="bg-slate-800 text-slate-300 text-xs rounded-full px-2 py-0.5 flex items-center gap-1">
      {label}
      <button
        onClick={onRemove}
        className="text-slate-500 hover:text-slate-200 transition"
        aria-label={`Remove ${label} filter`}
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<UserJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<JobFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [hasResume, setHasResume] = useState(false);
  const [newJobsCount, setNewJobsCount] = useState(0);

  const fetchJobs = useCallback(async (f: JobFilters, append = false) => {
    const params = new URLSearchParams();
    if (f.keyword) params.set('keyword', f.keyword);
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

  // Initial load + new-jobs count
  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchJobs(DEFAULT_FILTERS),
      fetch('/api/resume').then((r) => r.json()).then((d) => {
        if (d?.resume_text) {
          setHasResume(true);
          setFilters((f) => ({ ...f, sortBy: 'relevance_score' }));
        }
      }).catch(() => {}),
      fetch('/api/jobs/new-count').then((r) => r.json()).then((d) => {
        if (d?.count > 0) setNewJobsCount(d.count);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [fetchJobs]);

  // Auto-refresh every 10 minutes to pick up new scraper runs
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/jobs/new-count').then((r) => r.json()).then((d) => {
        if (d?.count > 0) setNewJobsCount(d.count);
      }).catch(() => {});
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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
  const activeCount = countActiveFilters(filters);

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

        {/* New jobs banner */}
        {newJobsCount > 0 && (
          <button
            onClick={() => {
              setNewJobsCount(0);
              setLoading(true);
              fetchJobs({ ...filters, page: 0 }).finally(() => setLoading(false));
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-success-500/10 border border-success-500/30 rounded-xl text-success-400 text-sm font-medium hover:bg-success-500/20 transition"
          >
            <Bell className="w-4 h-4" />
            {newJobsCount} new job{newJobsCount !== 1 ? 's' : ''} since your last visit — click to refresh
          </button>
        )}

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
            {/* Mobile filter trigger with active count badge */}
            <button
              onClick={() => setShowFilters(true)}
              className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-sm hover:bg-slate-700 transition"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeCount > 0 && (
                <span className="ml-0.5 bg-primary-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {activeCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Active filter chips */}
        {activeCount > 0 && (
          <div className="flex flex-wrap gap-1.5 -mt-2">
            {filters.keyword && (
              <Chip
                label={`"${filters.keyword}"`}
                onRemove={() => handleFilterChange({ ...filters, keyword: '', page: 0 })}
              />
            )}
            {filters.sources.map((s) => (
              <Chip
                key={s}
                label={SOURCE_LABELS[s] ?? s}
                onRemove={() => handleFilterChange({ ...filters, sources: filters.sources.filter((x) => x !== s), page: 0 })}
              />
            ))}
            {filters.jobTypes.map((jt) => (
              <Chip
                key={jt}
                label={JOB_TYPE_LABELS[jt] ?? jt}
                onRemove={() => handleFilterChange({ ...filters, jobTypes: filters.jobTypes.filter((x) => x !== jt), page: 0 })}
              />
            ))}
            {filters.country && (
              <Chip
                label={filters.country}
                onRemove={() => handleFilterChange({ ...filters, country: '', page: 0 })}
              />
            )}
            {filters.salaryMin > 0 && (
              <Chip
                label={`Min $${(filters.salaryMin / 1000).toFixed(0)}k`}
                onRemove={() => handleFilterChange({ ...filters, salaryMin: 0, page: 0 })}
              />
            )}
            {filters.salaryMax < 300000 && (
              <Chip
                label={`Max $${(filters.salaryMax / 1000).toFixed(0)}k`}
                onRemove={() => handleFilterChange({ ...filters, salaryMax: 300000, page: 0 })}
              />
            )}
            {filters.postedWithinDays !== null && (
              <Chip
                label={POSTED_WITHIN_LABELS[filters.postedWithinDays] ?? `Last ${filters.postedWithinDays}d`}
                onRemove={() => handleFilterChange({ ...filters, postedWithinDays: null, page: 0 })}
              />
            )}
            {filters.minScore > 0 && (
              <Chip
                label={`Score ≥${filters.minScore}`}
                onRemove={() => handleFilterChange({ ...filters, minScore: 0, page: 0 })}
              />
            )}
            {filters.showApplied && (
              <Chip
                label="Show Applied"
                onRemove={() => handleFilterChange({ ...filters, showApplied: false, page: 0 })}
              />
            )}
          </div>
        )}

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
