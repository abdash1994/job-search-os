import { cn } from '@/lib/utils';
import { getSourceLabel } from '@/lib/sources';

/** Deterministic color mapping for each job board */
const SOURCE_COLORS: Record<string, string> = {
  linkedin: 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30',
  indeed: 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30',
  remoteok: 'bg-green-500/15 text-green-300 ring-1 ring-green-500/30',
  weworkremotely: 'bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/30',
  remotive: 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30',
  jobspresso: 'bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/30',
  ycombinator: 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30',
  glassdoor: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  angel: 'bg-pink-500/15 text-pink-300 ring-1 ring-pink-500/30',
  greenhouse: 'bg-lime-500/15 text-lime-300 ring-1 ring-lime-500/30',
  lever: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30',
  workable: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
};

const DEFAULT_COLOR = 'bg-slate-700/60 text-slate-300 ring-1 ring-slate-600/50';

interface SourceBadgeProps {
  source: string;
  className?: string;
}

export function SourceBadge({ source, className }: SourceBadgeProps) {
  const key = source.toLowerCase().replace(/[^a-z]/g, '');
  const colorClass = SOURCE_COLORS[key] ?? DEFAULT_COLOR;
  const label = getSourceLabel(key);

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        colorClass,
        className
      )}
    >
      {label}
    </span>
  );
}
