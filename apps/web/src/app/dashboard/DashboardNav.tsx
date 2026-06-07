'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, CheckCircle, FileText, BarChart2, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/dashboard/applied', label: 'Applied', icon: CheckCircle },
  { href: '/dashboard/resume', label: 'Resume', icon: FileText },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/dashboard/status', label: 'Status', icon: Activity },
];

export function DashboardNav() {
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden lg:flex flex-col w-60 shrink-0 border-r border-slate-800 py-4 px-3 gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
              isActive(href)
                ? 'bg-primary-600/20 text-primary-300 border border-primary-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
            )}
          >
            <Icon className="w-4.5 h-4.5 shrink-0 w-[18px] h-[18px]" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 flex items-stretch">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
              isActive(href)
                ? 'text-primary-400'
                : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <Icon className={cn('w-5 h-5', isActive(href) && 'drop-shadow-[0_0_6px_rgba(99,102,241,0.8)]')} />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
