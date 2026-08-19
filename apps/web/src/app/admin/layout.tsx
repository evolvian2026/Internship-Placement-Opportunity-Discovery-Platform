'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/opportunities', label: 'Opportunities' },
  { href: '/admin/sources', label: 'Sources & ingestion' },
  { href: '/admin/quality', label: 'Data quality' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/system', label: 'System' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <RequireAuth adminOnly>
      <div className="space-y-5">
        <header>
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="mt-1 text-sm text-muted">
            Platform operations: opportunities, sources, data quality and users.
          </p>
        </header>

        <nav className="-mx-4 overflow-x-auto px-4" aria-label="Admin sections">
          <div className="flex min-w-max gap-1 border-b border-border">
            {SECTIONS.map((section) => {
              const active = section.href === '/admin' ? pathname === '/admin' : pathname.startsWith(section.href);
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  className={cn(
                    '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                    active ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-fg',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  {section.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {children}
      </div>
    </RequireAuth>
  );
}
