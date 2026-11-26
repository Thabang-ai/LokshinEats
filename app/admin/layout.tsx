'use client';

// The operator console's shell.
//
// Every admin screen used to carry its own RoleGuard, its own header and its
// own "back to the console" link, and the only way between them was a row of
// pills on one page. An operator moving between the order list, the kitchen
// queue and the money spent half their time going back the way they came.
//
// One sidebar, one role check, and a badge on anything waiting for a person
// — so a kitchen that registered an hour ago is visible from whatever screen
// the operator happens to be on, rather than only to whoever thinks to look.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Activity,
  Bike,
  FileClock,
  Scale,
  Store,
  Users,
  Wallet,
} from 'lucide-react';

import RoleGuard from '../../components/RoleGuard';
import { fetchMetrics, type PlatformMetrics } from '../../services/adminApi';

type Section = {
  href: string;
  label: string;
  icon: typeof Activity;
  /** How many things on this screen are waiting for a person. */
  waiting?: (metrics: PlatformMetrics) => number;
};

const SECTIONS: Section[] = [
  { href: '/admin', label: 'Overview', icon: Activity },
  {
    href: '/admin/kitchens',
    label: 'Kitchens',
    icon: Store,
    waiting: (metrics) => metrics.waiting.kitchens,
  },
  {
    href: '/admin/drivers',
    label: 'Drivers',
    icon: Bike,
    waiting: (metrics) => metrics.waiting.drivers,
  },
  { href: '/admin/users', label: 'People', icon: Users },
  { href: '/admin/wallets', label: 'Wallets', icon: Wallet },
  { href: '/admin/reconciliation', label: 'Reconciliation', icon: Scale },
  { href: '/admin/audit', label: 'Audit log', icon: FileClock },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);

  // Only for the badges. A console that cannot reach the API has bigger
  // problems than a missing number, and every screen inside says so itself.
  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetchMetrics()
        .then((next) => {
          if (!cancelled) setMetrics(next);
        })
        .catch(() => {
          if (!cancelled) setMetrics(null);
        });
    };

    load();
    // Slow on purpose: this is a queue length, not a live feed.
    const timer = setInterval(load, 60_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pathname]);

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 lg:flex">
        <nav className="bg-gray-900 text-white lg:w-60 lg:min-h-screen lg:flex-shrink-0">
          <div className="px-4 py-4 lg:py-6">
            <Link href="/admin" className="flex items-center gap-2">
              <Activity className="w-6 h-6" />
              <span className="font-bold text-lg">Operator</span>
            </Link>
          </div>

          {/* A row on a phone, a column on a desktop: the queue screens are
              desk work, but a disputed handover gets looked at wherever the
              operator is standing. */}
          <ul className="flex lg:flex-col gap-1 px-2 pb-3 overflow-x-auto lg:overflow-visible">
            {SECTIONS.map((section) => {
              const active =
                section.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(section.href);
              const waiting = metrics ? (section.waiting?.(metrics) ?? 0) : 0;
              const Icon = section.icon;

              return (
                <li key={section.href}>
                  <Link
                    href={section.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? 'bg-white/15 font-semibold'
                        : 'text-white/75 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span>{section.label}</span>
                    {waiting > 0 && (
                      <span
                        className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-bold"
                        title={`${waiting} waiting`}
                      >
                        {waiting}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </RoleGuard>
  );
}
