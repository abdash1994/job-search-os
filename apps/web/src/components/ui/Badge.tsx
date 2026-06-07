import { cn } from '@/lib/utils';

type BadgeColor =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'slate'
  | 'indigo'
  | 'purple'
  | 'pink'
  | 'teal'
  | 'cyan'
  | 'orange';

interface BadgeProps {
  children: React.ReactNode;
  color?: BadgeColor;
  size?: 'sm' | 'md';
  className?: string;
  dot?: boolean;
}

const colorClasses: Record<BadgeColor, string> = {
  default: 'bg-slate-700 text-slate-300',
  primary: 'bg-primary-600/20 text-primary-300 ring-1 ring-primary-500/30',
  success: 'bg-success-500/15 text-success-400 ring-1 ring-success-500/30',
  warning: 'bg-warning-500/15 text-warning-400 ring-1 ring-warning-500/30',
  danger: 'bg-danger-500/15 text-danger-400 ring-1 ring-danger-500/30',
  slate: 'bg-slate-700/60 text-slate-300 ring-1 ring-slate-600/50',
  indigo: 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30',
  purple: 'bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/30',
  pink: 'bg-pink-500/15 text-pink-300 ring-1 ring-pink-500/30',
  teal: 'bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/30',
  cyan: 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30',
  orange: 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30',
};

const dotColorClasses: Record<BadgeColor, string> = {
  default: 'bg-slate-400',
  primary: 'bg-primary-400',
  success: 'bg-success-400',
  warning: 'bg-warning-400',
  danger: 'bg-danger-400',
  slate: 'bg-slate-400',
  indigo: 'bg-indigo-400',
  purple: 'bg-purple-400',
  pink: 'bg-pink-400',
  teal: 'bg-teal-400',
  cyan: 'bg-cyan-400',
  orange: 'bg-orange-400',
};

export function Badge({ children, color = 'default', size = 'sm', className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full',
        size === 'sm' ? 'px-2 py-0.5 text-xs gap-1' : 'px-2.5 py-1 text-sm gap-1.5',
        colorClasses[color],
        className
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dotColorClasses[color])} />}
      {children}
    </span>
  );
}
