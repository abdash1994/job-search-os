'use client';

import { useState } from 'react';
import {
  MapPin,
  Briefcase,
  DollarSign,
  ExternalLink,
  Bookmark,
  CheckCircle,
  Clock,
  Calendar,
} from 'lucide-react';
import { cn, formatDate, formatSalary } from '@/lib/utils';
import { SourceBadge } from './SourceBadge';
import { ScoreBadge } from './ScoreBadge';
import { Badge } from './ui/Badge';
import type { UserJob, JobStatus } from '@/types';

interface JobCardProps {
  job: UserJob;
  onStatusChange: (jobId: string, status: JobStatus) => Promise<void>;
}

const JOB_TYPE_LABELS: Record<string, string> = {
  'full-time': 'Full-time',
  'part-time': 'Part-time',
  contract: 'Contract',
  freelance: 'Freelance',
  internship: 'Internship',
};

export function JobCard({ job, onStatusChange }: JobCardProps) {
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const isSaved = job.status === 'saved';
  const isApplied = ['applied', 'interviewing', 'offer', 'rejected'].includes(job.status);

  const handleSave = async () => {
    setIsChangingStatus(true);
    try {
      await onStatusChange(job.job_id, isSaved ? 'new' : 'saved');
    } finally {
      setIsChangingStatus(false);
    }
  };

  const handleApply = async () => {
    setIsChangingStatus(true);
    try {
      await onStatusChange(job.job_id, isApplied ? 'saved' : 'applied');
    } finally {
      setIsChangingStatus(false);
    }
  };

  return (
    <article className={cn(
      'group bg-slate-900 border rounded-xl p-4 transition-all hover:border-slate-700',
      isApplied ? 'border-primary-600/40' : 'border-slate-800'
    )}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Title + Company */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white text-sm leading-tight line-clamp-2">
                {job.job.title}
              </h3>
              <p className="text-slate-400 text-xs mt-0.5 font-medium truncate">
                {job.job.company}
              </p>
            </div>

            {/* Score badge — only if scored */}
            {job.score !== null && (
              <div className="shrink-0">
                <ScoreBadge score={job.score} breakdown={job.score_breakdown} />
              </div>
            )}
          </div>

          {/* Tags row */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <SourceBadge source={job.job.source} />

            {job.job.job_type && (
              <Badge color="slate">
                {JOB_TYPE_LABELS[job.job.job_type] ?? job.job.job_type}
              </Badge>
            )}

            {job.job.is_remote && (
              <Badge color="teal">Remote</Badge>
            )}

            {job.job.location && !job.job.is_remote && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[120px]">{job.job.location}</span>
              </span>
            )}

            {job.status !== 'new' && (
              <Badge
                color={
                  job.status === 'offer'
                    ? 'success'
                    : job.status === 'rejected'
                    ? 'danger'
                    : job.status === 'interviewing'
                    ? 'warning'
                    : 'primary'
                }
                dot
              >
                {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
              </Badge>
            )}
          </div>

          {/* Salary */}
          {(job.job.salary_min || job.job.salary_max) && (
            <p className="flex items-center gap-1 text-xs text-slate-300 mt-1.5 font-medium">
              <DollarSign className="w-3 h-3 text-slate-400 shrink-0" />
              {formatSalary(job.job.salary_min, job.job.salary_max, job.job.salary_currency ?? 'USD')}
            </p>
          )}

          {/* Dates + actions */}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800">
            <div className="flex flex-col gap-0.5">
              {job.job.posted_at && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Calendar className="w-3 h-3 shrink-0" />
                  Posted {formatDate(job.job.posted_at)}
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Clock className="w-3 h-3 shrink-0" />
                Scraped {formatDate(job.job.scraped_at)}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleSave}
                disabled={isChangingStatus || isApplied}
                title={isSaved ? 'Unsave' : 'Save job'}
                className={cn(
                  'p-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                  isSaved
                    ? 'text-primary-400 bg-primary-500/15 hover:bg-primary-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                )}
              >
                <Bookmark className={cn('w-4 h-4', isSaved && 'fill-current')} />
              </button>

              <button
                onClick={handleApply}
                disabled={isChangingStatus}
                title={isApplied ? 'Mark as saved' : 'Mark as applied'}
                className={cn(
                  'p-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                  isApplied
                    ? 'text-success-400 bg-success-500/15 hover:bg-success-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                )}
              >
                <CheckCircle className={cn('w-4 h-4', isApplied && 'fill-current')} />
              </button>

              <a
                href={job.job.url}
                target="_blank"
                rel="noopener noreferrer"
                title="View job"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
