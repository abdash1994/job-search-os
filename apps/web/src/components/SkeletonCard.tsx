export function SkeletonCard() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 animate-skeleton-pulse">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-3/4 rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
        </div>
        <div className="skeleton h-6 w-16 rounded-full" />
      </div>

      {/* Chips */}
      <div className="flex gap-2">
        <div className="skeleton h-5 w-20 rounded-full" />
        <div className="skeleton h-5 w-24 rounded-full" />
        <div className="skeleton h-5 w-16 rounded-full" />
      </div>

      {/* Salary */}
      <div className="skeleton h-3 w-1/3 rounded" />

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <div className="skeleton h-3 w-28 rounded" />
        <div className="flex gap-2">
          <div className="skeleton h-7 w-14 rounded-lg" />
          <div className="skeleton h-7 w-14 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonCardList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
