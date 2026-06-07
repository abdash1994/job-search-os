'use client';

import { useState } from 'react';
import { cn, getScoreBgColor, getScoreBadge } from '@/lib/utils';
import type { ScoreBreakdown } from '@/types';

interface ScoreBadgeProps {
  score: number;
  breakdown?: ScoreBreakdown | null;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function ScoreBadge({ score, breakdown, showLabel = false, size = 'sm' }: ScoreBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const bgColor = getScoreBgColor(score);
  const label = getScoreBadge(score);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onTouchStart={() => setShowTooltip((v) => !v)}
    >
      <span
        className={cn(
          'inline-flex items-center justify-center font-bold rounded-full ring-1 tabular-nums',
          size === 'sm' ? 'w-9 h-9 text-sm' : 'w-11 h-11 text-base',
          bgColor
        )}
      >
        {score}
      </span>

      {showLabel && (
        <span className={cn('ml-1.5 self-center text-xs font-medium', getScoreBgColor(score).split(' ')[1])}>
          {label}
        </span>
      )}

      {/* Tooltip with score breakdown */}
      {showTooltip && breakdown && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 w-44 bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-xl text-xs pointer-events-none animate-fade-in">
          <p className="font-semibold text-white mb-2">Score Breakdown</p>
          <div className="space-y-1.5">
            <ScoreRow label="Skills match" value={breakdown.skills_score} />
            <ScoreRow label="Title match" value={breakdown.title_score} />
            <ScoreRow label="Experience" value={breakdown.experience_score} />
          </div>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700" />
        </div>
      )}
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          />
        </div>
        <span className="text-slate-300 w-6 text-right">{value}</span>
      </div>
    </div>
  );
}
