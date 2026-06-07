import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mb-4 text-slate-500">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-200 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-slate-400 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
