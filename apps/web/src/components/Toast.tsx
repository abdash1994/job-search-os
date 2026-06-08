'use client';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Toast } from '@/hooks/useToast';

const BORDER_STYLES: Record<string, string> = {
  success: 'border-l-4 border-l-green-500 bg-slate-900',
  error: 'border-l-4 border-l-red-500 bg-slate-900',
  info: 'border-l-4 border-l-indigo-500 bg-slate-900',
};

const ICONS: Record<string, React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />,
  error: <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />,
  info: <Info className="w-4 h-4 text-indigo-400 shrink-0" />,
};

function ToastItem({ toast, dismiss }: { toast: Toast; dismiss: (id: string) => void }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-lg shadow-xl',
        'ring-1 ring-slate-700/50',
        'animate-in slide-in-from-bottom-2 fade-in duration-200',
        BORDER_STYLES[toast.type] ?? BORDER_STYLES.info,
        'min-w-[260px] max-w-[380px]'
      )}
      role="alert"
      aria-live="polite"
    >
      {ICONS[toast.type]}
      <p className="flex-1 text-sm text-slate-100 leading-snug">{toast.message}</p>
      <button
        onClick={() => dismiss(toast.id)}
        className="text-slate-400 hover:text-slate-200 transition-colors shrink-0 mt-0.5"
        aria-label="Dismiss notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ToastContainer({
  toasts,
  dismiss,
}: {
  toasts: Toast[];
  dismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-50 flex flex-col gap-2 bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-auto"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} dismiss={dismiss} />
      ))}
    </div>
  );
}
