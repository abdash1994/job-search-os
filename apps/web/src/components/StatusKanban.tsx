'use client';

import { useState } from 'react';
import { ChevronDown, ExternalLink, Pencil, Check } from 'lucide-react';
import { cn, formatDate, formatSalary } from '@/lib/utils';
import { SourceBadge } from './SourceBadge';
import type { UserJob, JobStatus } from '@/types';

const PIPELINE_STAGES: { status: JobStatus; label: string; color: string }[] = [
  { status: 'saved', label: 'Saved', color: 'border-slate-600' },
  { status: 'applied', label: 'Applied', color: 'border-primary-500' },
  { status: 'interviewing', label: 'Interviewing', color: 'border-warning-500' },
  { status: 'offer', label: 'Offer', color: 'border-success-500' },
  { status: 'rejected', label: 'Rejected', color: 'border-danger-500' },
];

function getDefaultOpenStages(byStatus: Record<string, UserJob[]>): Set<JobStatus> {
  let maxCount = -1;
  let maxStatus: JobStatus = 'saved';
  for (const { status } of PIPELINE_STAGES) {
    const count = byStatus[status]?.length ?? 0;
    if (count > maxCount) {
      maxCount = count;
      maxStatus = status;
    }
  }
  return new Set([maxStatus]);
}

const ALL_STATUSES: JobStatus[] = ['saved', 'applied', 'interviewing', 'offer', 'rejected'];

interface StatusKanbanProps {
  jobs: UserJob[];
  onStatusChange: (jobId: string, status: JobStatus) => Promise<void>;
  onNotesUpdate: (jobId: string, notes: string) => Promise<void>;
}

export function StatusKanban({ jobs, onStatusChange, onNotesUpdate }: StatusKanbanProps) {
  const byStatus = Object.fromEntries(
    PIPELINE_STAGES.map(({ status }) => [
      status,
      jobs.filter((j) => j.status === status),
    ])
  );

  const [openStages, setOpenStages] = useState<Set<JobStatus>>(
    () => getDefaultOpenStages(byStatus)
  );

  const toggleStage = (status: JobStatus) => {
    setOpenStages((prev) => {
      const next = new Set(prev);
      next.has(status) ? next.delete(status) : next.add(status);
      return next;
    });
  };

  return (
    <>
      {/* Mobile: vertical accordion */}
      <div className="lg:hidden flex flex-col gap-2">
        {PIPELINE_STAGES.map(({ status, label, color }) => {
          const stageJobs = byStatus[status] ?? [];
          const isOpen = openStages.has(status);
          return (
            <div key={status} className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleStage(status)}
                className="flex items-center justify-between w-full px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <div className={cn('w-2 h-2 rounded-full border-2', color)} />
                  <span className="text-sm font-semibold text-slate-200">{label}</span>
                  <span className="text-xs bg-slate-800 text-slate-400 rounded-full px-2 py-0.5">
                    {stageJobs.length}
                  </span>
                </div>
                <ChevronDown className={cn('w-4 h-4 text-slate-500 transition-transform', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-2">
                  {stageJobs.length === 0 ? (
                    <p className="text-xs text-slate-600 italic py-2 text-center">No jobs here</p>
                  ) : (
                    stageJobs.map((job) => (
                      <KanbanCard
                        key={job.id}
                        job={job}
                        onStatusChange={onStatusChange}
                        onNotesUpdate={onNotesUpdate}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop: horizontal columns */}
      <div className="hidden lg:flex gap-3 overflow-x-auto pb-4 no-scrollbar">
        {PIPELINE_STAGES.map(({ status, label, color }) => (
          <KanbanColumn
            key={status}
            status={status}
            label={label}
            color={color}
            jobs={byStatus[status] ?? []}
            onStatusChange={onStatusChange}
            onNotesUpdate={onNotesUpdate}
          />
        ))}
      </div>
    </>
  );
}

function KanbanColumn({
  status, label, color, jobs, onStatusChange, onNotesUpdate,
}: {
  status: JobStatus;
  label: string;
  color: string;
  jobs: UserJob[];
  onStatusChange: (jobId: string, status: JobStatus) => Promise<void>;
  onNotesUpdate: (jobId: string, notes: string) => Promise<void>;
}) {
  return (
    <div className={cn('shrink-0 w-72 bg-slate-900/70 border-t-2 rounded-xl', color)}>
      <div className="flex items-center justify-between px-3 py-2.5">
        <h3 className="text-sm font-semibold text-slate-200">{label}</h3>
        <span className="text-xs bg-slate-800 text-slate-400 rounded-full px-2 py-0.5 font-medium">
          {jobs.length}
        </span>
      </div>

      <div className="px-2 pb-2 space-y-2 min-h-[200px]">
        {jobs.map((job) => (
          <KanbanCard
            key={job.id}
            job={job}
            onStatusChange={onStatusChange}
            onNotesUpdate={onNotesUpdate}
          />
        ))}
        {jobs.length === 0 && (
          <div className="flex items-center justify-center h-24 text-xs text-slate-600 italic">
            No jobs here
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanCard({
  job, onStatusChange, onNotesUpdate,
}: {
  job: UserJob;
  onStatusChange: (jobId: string, status: JobStatus) => Promise<void>;
  onNotesUpdate: (jobId: string, notes: string) => Promise<void>;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(job.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const handleStatusChange = async (newStatus: JobStatus) => {
    setStatusOpen(false);
    setChangingStatus(true);
    try {
      await onStatusChange(job.job_id, newStatus);
    } finally {
      setChangingStatus(false);
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await onNotesUpdate(job.id, notesValue);
      setEditingNotes(false);
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2 group hover:border-slate-700 transition">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{job.job.title}</p>
          <p className="text-xs text-slate-400 truncate">{job.job.company}</p>
        </div>
        <a
          href={job.job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-slate-500 hover:text-slate-300 transition"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="flex items-center gap-1.5">
        <SourceBadge source={job.job.source} />
        {job.job.salary_min || job.job.salary_max ? (
          <span className="text-xs text-slate-400">
            {formatSalary(job.job.salary_min, job.job.salary_max, job.job.salary_currency ?? 'USD')}
          </span>
        ) : null}
      </div>

      {job.applied_at && (
        <p className="text-xs text-slate-500">Applied {formatDate(job.applied_at)}</p>
      )}

      {/* Notes */}
      {editingNotes ? (
        <div className="space-y-1.5">
          <textarea
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            rows={3}
            placeholder="Add notes…"
            className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <div className="flex gap-1.5 justify-end">
            <button
              onClick={() => setEditingNotes(false)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveNotes}
              disabled={savingNotes}
              className="flex items-center gap-1 text-xs bg-primary-600 hover:bg-primary-500 text-white px-2 py-1 rounded transition disabled:opacity-50"
            >
              <Check className="w-3 h-3" /> Save
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditingNotes(true)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition w-full text-left"
        >
          <Pencil className="w-3 h-3 shrink-0" />
          <span className="truncate">{job.notes ? job.notes : 'Add notes…'}</span>
        </button>
      )}

      {/* Status dropdown */}
      <div className="relative">
        <button
          onClick={() => setStatusOpen((v) => !v)}
          disabled={changingStatus}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition disabled:opacity-50 w-full"
        >
          <span>Move to…</span>
          <ChevronDown className="w-3 h-3 ml-auto" />
        </button>
        {statusOpen && (
          <div className="absolute bottom-full left-0 mb-1 w-full z-20 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
            {ALL_STATUSES.filter((s) => s !== job.status).map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition capitalize"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
