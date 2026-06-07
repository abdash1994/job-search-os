import { cn } from '@/lib/utils';
import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Input({ label, error, leftIcon, rightIcon, className, id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-300 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          className={cn(
            'w-full bg-slate-800 border rounded-lg text-white placeholder-slate-500 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            leftIcon ? 'pl-9 pr-3 py-2.5' : 'px-3 py-2.5',
            rightIcon ? 'pr-9' : '',
            error ? 'border-danger-500' : 'border-slate-700',
            className
          )}
          {...props}
        />
        {rightIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
            {rightIcon}
          </span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-danger-400">{error}</p>}
    </div>
  );
}
