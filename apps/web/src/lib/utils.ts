import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format, isAfter, subDays } from 'date-fns';

/** Merge Tailwind classes safely, resolving conflicts */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns a human-friendly relative date string.
 * Recent dates use "X days ago"; older ones use "Jun 5" format.
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return 'Unknown';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'Unknown';

  if (isAfter(d, subDays(new Date(), 14))) {
    return formatDistanceToNow(d, { addSuffix: true });
  }
  return format(d, 'MMM d');
}

/**
 * Formats a salary range into a compact string like "$80k–$120k".
 * Falls back gracefully when values are missing.
 */
export function formatSalary(
  min: number | null | undefined,
  max: number | null | undefined,
  currency = 'USD'
): string {
  const symbol = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency;
  const fmt = (n: number) => (n >= 1000 ? `${symbol}${Math.round(n / 1000)}k` : `${symbol}${n}`);

  if (min && max) return `${fmt(min)}–${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  if (max) return `Up to ${fmt(max)}`;
  return 'Salary not listed';
}

/**
 * Returns a Tailwind text-color class based on a 0–100 relevance score.
 * ≥75 → green, ≥50 → amber, ≥25 → orange, <25 → red
 */
export function getScoreColor(score: number): string {
  if (score >= 75) return 'text-success-500';
  if (score >= 50) return 'text-warning-500';
  if (score >= 25) return 'text-orange-500';
  return 'text-danger-500';
}

/**
 * Returns a background + text color class pair for score badge rendering.
 */
export function getScoreBgColor(score: number): string {
  if (score >= 75) return 'bg-success-500/20 text-success-400 ring-success-500/30';
  if (score >= 50) return 'bg-warning-500/20 text-warning-400 ring-warning-500/30';
  if (score >= 25) return 'bg-orange-500/20 text-orange-400 ring-orange-500/30';
  return 'bg-danger-500/20 text-danger-400 ring-danger-500/30';
}

/**
 * Returns a human-readable label for a 0–100 relevance score.
 */
export function getScoreBadge(score: number): string {
  if (score >= 75) return 'Excellent';
  if (score >= 50) return 'Good';
  if (score >= 25) return 'Fair';
  return 'Low';
}

/** Truncate a string to a given length with an ellipsis */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/** Debounce a function */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
