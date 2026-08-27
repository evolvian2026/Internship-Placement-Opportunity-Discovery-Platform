'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from './AuthProvider';
import { ThemeToggle } from './ThemeToggle';
import { Badge, Button } from './ui';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Shown in the mobile bottom bar (requirement 39). */
  mobile?: boolean;
}

const icon = (path: string): ReactNode => (
  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d={path} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: icon('M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z'), mobile: true },
  { href: '/opportunities', label: 'Search', icon: icon('M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3'), mobile: true },
  { href: '/recommended', label: 'Recommended', icon: icon('M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z'), mobile: true },
  { href: '/saved', label: 'Saved', icon: icon('M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z'), mobile: true },
  { href: '/applications', label: 'Applications', icon: icon('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'), mobile: true },
];

const DISCOVER_LINKS = [
  { href: '/internships', label: 'Internships' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/fresher-jobs', label: 'Fresher & Off-Campus' },
  { href: '/government-jobs', label: 'Government' },
  { href: '/psu-jobs', label: 'PSU' },
  { href: '/companies', label: 'Companies' },
  { href: '/deadlines', label: 'Deadlines' },
  { href: '/alerts', label: 'Alerts' },
];

const TOOLS_LINKS = [
  { href: '/assistant', label: 'AI Career Assistant' },
  { href: '/near-misses', label: 'Near Misses' },
  { href: '/skills', label: 'Skill Gap Analysis' },
  { href: '/readiness', label: 'Career Readiness' },
  { href: '/profile', label: 'Profile & Resume' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    void api.notifications
      .list(true)
      .then((res) => setUnread(res.unreadCount))
      .catch(() => undefined);
  }, [user, pathname]);

  // Close the mobile menu whenever the route changes.
  useEffect(() => setMenuOpen(false), [pathname]);

  const isActive = (href: string): boolean => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-fg"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link href={user ? '/dashboard' : '/'} className="flex shrink-0 items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-sm text-brand-fg">O</span>
            <span className="hidden text-sm sm:inline">Opportunity Discovery</span>
          </Link>

          <nav className="ml-2 hidden items-center gap-0.5 lg:flex" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive(item.href) ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
                aria-current={isActive(item.href) ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
            <DropdownNav label="Discover" links={DISCOVER_LINKS} pathname={pathname} />
            <DropdownNav label="Tools" links={TOOLS_LINKS} pathname={pathname} />
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />

            {user && (
              <Link
                href="/notifications"
                className="relative rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
                </svg>
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Link>
            )}

            {loading ? (
              <div className="skeleton h-8 w-20 rounded-lg" />
            ) : user ? (
              <div className="flex items-center gap-1">
                {user.role === 'ADMIN' && (
                  <Link href="/admin" className="hidden sm:block">
                    <Badge tone="brand">Admin</Badge>
                  </Link>
                )}
                <Link
                  href="/profile"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand"
                  aria-label="Your profile"
                  title={user.name}
                >
                  {user.name.slice(0, 1).toUpperCase()}
                </Link>
                <Button variant="ghost" size="sm" onClick={() => void logout()} className="hidden sm:inline-flex">
                  Sign out
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link href="/login">
                  <Button variant="ghost" size="sm">Sign in</Button>
                </Link>
                <Link href="/register">
                  <Button size="sm">Get started</Button>
                </Link>
              </div>
            )}

            <button
              type="button"
              className="rounded-lg p-2 text-muted hover:bg-surface-2 lg:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-label="Toggle navigation menu"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d={menuOpen ? 'M18 6L6 18M6 6l12 12' : 'M3 12h18M3 6h18M3 18h18'} strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="border-t border-border bg-surface px-4 py-3 lg:hidden" aria-label="Mobile">
            <div className="grid gap-1">
              {[...NAV_ITEMS.map((n) => ({ href: n.href, label: n.label })), ...DISCOVER_LINKS, ...TOOLS_LINKS].map(
                (link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm',
                      isActive(link.href) ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2',
                    )}
                  >
                    {link.label}
                  </Link>
                ),
              )}
              {user && (
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-surface-2"
                >
                  Sign out
                </button>
              )}
            </div>
          </nav>
        )}
      </header>

      <main id="main" className="mx-auto max-w-7xl px-4 pb-24 pt-6 lg:pb-10">
        {children}
      </main>

      {/* Mobile bottom bar: Home, Search, Recommended, Saved, Applications. */}
      {user && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur lg:hidden"
          aria-label="Mobile primary"
        >
          <div className="mx-auto grid max-w-lg grid-cols-5">
            {NAV_ITEMS.filter((item) => item.mobile).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                  isActive(item.href) ? 'text-brand' : 'text-subtle',
                )}
                aria-current={isActive(item.href) ? 'page' : undefined}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

function DropdownNav({
  label,
  links,
  pathname,
}: {
  label: string;
  links: { href: string; label: string }[];
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const active = links.some((l) => pathname.startsWith(l.href));

  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        className={cn(
          'flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
          active ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-fg',
        )}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {label}
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 w-56 rounded-xl border border-border bg-surface p-1.5 shadow-lg">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'block rounded-lg px-3 py-2 text-sm transition-colors',
                pathname.startsWith(link.href) ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
