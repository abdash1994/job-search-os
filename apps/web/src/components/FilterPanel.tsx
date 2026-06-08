'use client';

import { useState, useEffect } from 'react';
import { SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/Button';
import type { JobFilters, JobType, SortBy } from '@/types';

// Exact source identifiers that match the scraper sources in the DB
const ALL_SOURCES = [
  'weworkremotely',
  'workingnomads',
  'remote_co',
  'nodesk',
  'remote100k',
  'skipthedrive',
  'justremote',
  'topstartups',
  'wellfound',
  'crunchbase',
];

export const SOURCE_LABELS: Record<string, string> = {
  weworkremotely: 'We Work Remotely',
  workingnomads: 'Working Nomads',
  remote_co: 'Remote.co',
  nodesk: 'NoDesk',
  remote100k: 'Remote 100K',
  skipthedrive: 'Skip The Drive',
  justremote: 'JustRemote',
  topstartups: 'Top Startups',
  wellfound: 'Wellfound',
  crunchbase: 'Crunchbase',
};

const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: 'full-time', label: 'Full-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'freelance', label: 'Freelance' },
];

const POSTED_WITHIN_OPTIONS = [
  { value: null, label: 'Any time' },
  { value: 1, label: 'Last 24h' },
  { value: 3, label: 'Last 3 days' },
  { value: 7, label: 'Last week' },
  { value: 14, label: 'Last 2 weeks' },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'relevance_score', label: 'Relevance score' },
  { value: 'date_posted', label: 'Date posted' },
  { value: 'scraped_at', label: 'Date scraped' },
];

/** Returns the number of filters that deviate from their default (inactive) state. */
export function countActiveFilters(filters: JobFilters): number {
  let count = 0;
  if (filters.keyword) count++;
  if (filters.sources.length) count++;
  if (filters.jobTypes.length) count++;
  if (filters.country) count++;
  if (filters.salaryMin > 0) count++;
  if (filters.salaryMax < 300000) count++;
  if (filters.postedWithinDays !== null) count++;
  if (filters.minScore > 0) count++;
  if (filters.showApplied) count++;
  return count;
}

interface FilterPanelProps {
  filters: JobFilters;
  onChange: (filters: JobFilters) => void;
  hasResume: boolean;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function FilterPanel({ filters, onChange, hasResume, isMobileOpen, onMobileClose }: FilterPanelProps) {
  const update = <K extends keyof JobFilters>(key: K, value: JobFilters[K]) =>
    onChange({ ...filters, [key]: value, page: 0 });

  // ── Local state for debounced / release-only inputs ──────────────────────

  const [localKeyword, setLocalKeyword] = useState(filters.keyword ?? '');
  const [localCountry, setLocalCountry] = useState(filters.country ?? '');
  const [localSalaryMin, setLocalSalaryMin] = useState(filters.salaryMin);
  const [localSalaryMax, setLocalSalaryMax] = useState(filters.salaryMax);

  // Sync local state from parent when filters change externally (e.g. reset)
  useEffect(() => { setLocalKeyword(filters.keyword ?? ''); }, [filters.keyword]);
  useEffect(() => { setLocalCountry(filters.country ?? ''); }, [filters.country]);
  useEffect(() => { setLocalSalaryMin(filters.salaryMin); }, [filters.salaryMin]);
  useEffect(() => { setLocalSalaryMax(filters.salaryMax); }, [filters.salaryMax]);

  // Debounce keyword → 400 ms
  useEffect(() => {
    if (localKeyword === (filters.keyword ?? '')) return;
    const timer = setTimeout(() => {
      onChange({ ...filters, keyword: localKeyword, page: 0 });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localKeyword]);

  // Debounce country → 400 ms
  useEffect(() => {
    if (localCountry === (filters.country ?? '')) return;
    const timer = setTimeout(() => {
      onChange({ ...filters, country: localCountry, page: 0 });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localCountry]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const toggleSource = (src: string) => {
    const next = filters.sources.includes(src)
      ? filters.sources.filter((s) => s !== src)
      : [...filters.sources, src];
    update('sources', next);
  };

  const toggleJobType = (jt: JobType) => {
    const next = filters.jobTypes.includes(jt)
      ? filters.jobTypes.filter((t) => t !== jt)
      : [...filters.jobTypes, jt];
    update('jobTypes', next);
  };

  const handleSalaryMouseUp = () => {
    if (localSalaryMin !== filters.salaryMin || localSalaryMax !== filters.salaryMax) {
      onChange({ ...filters, salaryMin: localSalaryMin, salaryMax: localSalaryMax, page: 0 });
    }
  };

  const resetFilters = () =>
    onChange({
      keyword: '',
      sources: [], jobTypes: [], country: '', salaryMin: 0, salaryMax: 300000,
      postedWithinDays: null, minScore: 0, showApplied: false,
      sortBy: hasResume ? 'relevance_score' : 'scraped_at',
      page: 0,
    });

  // ── Panel content ─────────────────────────────────────────────────────────

  const content = (
    <div className="space-y-5">
      {/* Keyword search */}
      <FilterSection title="Search">
        <input
          type="search"
          value={localKeyword}
          onChange={(e) => setLocalKeyword(e.target.value)}
          placeholder="Job title, company, skill…"
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </FilterSection>

      {/* Sort */}
      <FilterSection title="Sort by">
        <div className="flex flex-col gap-1.5">
          {SORT_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="sortBy"
                value={opt.value}
                checked={filters.sortBy === opt.value}
                onChange={() => update('sortBy', opt.value)}
                className="accent-primary-500"
              />
              <span className="text-sm text-slate-300">{opt.label}</span>
              {opt.value === 'relevance_score' && !hasResume && (
                <span className="text-xs text-slate-500">(upload resume)</span>
              )}
            </label>
          ))}
        </div>
      </FilterSection>

      {/* Show applied — second section, right after Sort */}
      <FilterSection title="Visibility">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm text-slate-300">Show applied jobs</span>
          <button
            role="switch"
            aria-checked={filters.showApplied}
            onClick={() => update('showApplied', !filters.showApplied)}
            className={cn(
              'relative inline-flex w-10 h-5 rounded-full transition-colors focus:outline-none',
              filters.showApplied ? 'bg-primary-600' : 'bg-slate-700'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow',
                filters.showApplied && 'translate-x-5'
              )}
            />
          </button>
        </label>
      </FilterSection>

      {/* Sources */}
      <FilterSection title="Job boards">
        <div className="space-y-1.5">
          {ALL_SOURCES.map((src) => (
            <label key={src} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.sources.includes(src)}
                onChange={() => toggleSource(src)}
                className="rounded accent-primary-500"
              />
              <span className="text-sm text-slate-300">{SOURCE_LABELS[src] ?? src}</span>
            </label>
          ))}
        </div>
      </FilterSection>

      {/* Job Types */}
      <FilterSection title="Job type">
        <div className="space-y-1.5">
          {JOB_TYPES.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.jobTypes.includes(value)}
                onChange={() => toggleJobType(value)}
                className="rounded accent-primary-500"
              />
              <span className="text-sm text-slate-300">{label}</span>
            </label>
          ))}
        </div>
      </FilterSection>

      {/* Country — debounced */}
      <FilterSection title="Country">
        <input
          type="text"
          value={localCountry}
          onChange={(e) => setLocalCountry(e.target.value)}
          placeholder="e.g. US, Germany, UK"
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </FilterSection>

      {/* Posted within */}
      <FilterSection title="Posted within">
        <div className="flex flex-col gap-1.5">
          {POSTED_WITHIN_OPTIONS.map((opt) => (
            <label key={String(opt.value)} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="postedWithin"
                checked={filters.postedWithinDays === opt.value}
                onChange={() => update('postedWithinDays', opt.value)}
                className="accent-primary-500"
              />
              <span className="text-sm text-slate-300">{opt.label}</span>
            </label>
          ))}
        </div>
      </FilterSection>

      {/* Salary range — fires only on mouse/touch release */}
      <FilterSection title={`Salary: $${(localSalaryMin / 1000).toFixed(0)}k – $${(localSalaryMax / 1000).toFixed(0)}k`}>
        <div className="space-y-3 px-1">
          <div>
            <p className="text-xs text-slate-500 mb-1">Minimum</p>
            <input
              type="range"
              min={0} max={300000} step={5000}
              value={localSalaryMin}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v <= localSalaryMax) setLocalSalaryMin(v);
              }}
              onMouseUp={handleSalaryMouseUp}
              onTouchEnd={handleSalaryMouseUp}
              className="w-full accent-primary-500"
            />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Maximum</p>
            <input
              type="range"
              min={0} max={300000} step={5000}
              value={localSalaryMax}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= localSalaryMin) setLocalSalaryMax(v);
              }}
              onMouseUp={handleSalaryMouseUp}
              onTouchEnd={handleSalaryMouseUp}
              className="w-full accent-primary-500"
            />
          </div>
        </div>
      </FilterSection>

      {/* Min relevance score */}
      {hasResume && (
        <FilterSection title={`Min relevance: ${filters.minScore}`}>
          <input
            type="range"
            min={0} max={100} step={5}
            value={filters.minScore}
            onChange={(e) => update('minScore', Number(e.target.value))}
            className="w-full accent-primary-500 px-1"
          />
          <div className="flex justify-between text-xs text-slate-500 px-1 mt-1">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
        </FilterSection>
      )}

      {/* Reset */}
      <Button variant="ghost" size="sm" onClick={resetFilters} className="w-full text-slate-400">
        Reset all filters
      </Button>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 shrink-0">
        <div className="sticky top-4 bg-slate-900 border border-slate-800 rounded-xl p-4 max-h-[calc(100vh-2rem)] overflow-y-auto no-scrollbar">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4" /> Filters
            </h2>
          </div>
          {content}
        </div>
      </aside>

      {/* Mobile drawer */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onMobileClose} />
          <div className="relative ml-auto w-80 max-w-full h-full bg-slate-900 border-l border-slate-800 overflow-y-auto p-4 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4" /> Filters
              </h2>
              <button onClick={onMobileClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            {content}
          </div>
        </div>
      )}
    </>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-slate-800 pb-4 last:border-0 last:pb-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full text-left mb-3 group"
      >
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider group-hover:text-slate-300 transition">
          {title}
        </span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-slate-500 transition-transform', !open && '-rotate-90')} />
      </button>
      {open && children}
    </div>
  );
}
