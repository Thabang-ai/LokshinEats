'use client';

// Admin / Reconciliation
// A day's money, told apart.
//
// "Takings" is four different numbers wearing one coat, and every operator
// who has ever read the single figure has been misled by it:
//
//   - what customers paid;
//   - how much of that the platform never touched, because a driver took it
//     in cash at a door and owes it to a kitchen;
//   - what the kitchens and drivers are owed; and
//   - what LokshinEats actually earned.
//
// So this page refuses to add them together. The headline is what customers
// paid; everything under it says where that money went and who is holding it
// right now.
//
// It also checks rather than assumes: every order carries the split frozen
// onto it when it was placed, and if any of them fails to add up this page
// names the order instead of absorbing the difference into a total.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  CreditCard,
  Scale,
  Undo2,
  Wallet,
} from 'lucide-react';

import RoleGuard from '../../../components/RoleGuard';
import { ApiError } from '../../../services/apiClient';
import {
  fetchReconciliation,
  type DayReconciliation,
} from '../../../services/adminApi';

/** Today in Johannesburg, which is where the orders are. */
function todayInSast(): string {
  const now = new Date();
  const sast = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  return sast.toISOString().slice(0, 10);
}

function rands(amount: number): string {
  return `R${amount.toFixed(2)}`;
}

function Figure({
  label,
  amount,
  hint,
  icon,
  tone = 'plain',
}: {
  label: string;
  amount: string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: 'plain' | 'headline' | 'warning';
}) {
  const styles = {
    plain: 'bg-white border-gray-100',
    headline: 'bg-gray-900 text-white border-gray-900',
    warning: 'bg-amber-50 border-amber-200',
  }[tone];

  return (
    <div className={`rounded-xl border p-5 shadow-sm ${styles}`}>
      <div
        className={`flex items-center gap-2 text-sm font-semibold ${
          tone === 'headline' ? 'text-white/70' : 'text-gray-500'
        }`}
      >
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold mt-2">{amount}</p>
      {hint && (
        <p
          className={`text-xs mt-1 ${
            tone === 'headline' ? 'text-white/60' : 'text-gray-500'
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export default function ReconciliationPage() {
  const [date, setDate] = useState(todayInSast());
  const [report, setReport] = useState<DayReconciliation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetchReconciliation(date)
      .then((data) => {
        if (cancelled) return;
        setReport(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setReport(null);
        setError(
          err instanceof ApiError ? err.message : 'Could not read that day.',
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [date]);

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white">
          <div className="container mx-auto px-4 py-6">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white mb-2"
            >
              <ArrowLeft className="w-4 h-4" /> Operator console
            </Link>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <Scale className="w-7 h-7" />
                  Reconciliation
                </h1>
                <p className="text-white/70">
                  Where one day&rsquo;s money came from, and where it went
                </p>
              </div>
              <label className="text-sm">
                <span className="block text-white/70 mb-1">Day</span>
                <input
                  type="date"
                  value={date}
                  max={todayInSast()}
                  onChange={(event) => setDate(event.target.value)}
                  className="px-3 py-2 rounded-lg text-gray-900 font-semibold"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800 mb-6">
              <p className="font-semibold mb-1">Could not read that day</p>
              <p>{error}</p>
            </div>
          )}

          {isLoading && (
            <p className="text-gray-400 py-12 text-center">Adding it up…</p>
          )}

          {!isLoading && report && (
            <>
              {/* Does the day add up? The first thing worth knowing. */}
              <div
                className={`rounded-xl border p-5 mb-6 flex items-start gap-3 ${
                  report.balances
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                {report.balances ? (
                  <CheckCircle2 className="w-5 h-5 text-green-700 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-700 mt-0.5 shrink-0" />
                )}
                <div>
                  <p
                    className={`font-semibold ${
                      report.balances ? 'text-green-900' : 'text-red-900'
                    }`}
                  >
                    {report.balances
                      ? 'Every order adds up'
                      : `${report.unbalanced.length} order${
                          report.unbalanced.length === 1 ? '' : 's'
                        } did not add up`}
                  </p>
                  <p
                    className={`text-sm ${
                      report.balances ? 'text-green-800' : 'text-red-800'
                    }`}
                  >
                    {report.balances
                      ? 'What each customer paid equals what was split between the kitchen, the driver and LokshinEats.'
                      : 'What the customer paid does not equal what was split. These need chasing:'}
                  </p>
                  {!report.balances && (
                    <ul className="mt-2 text-sm text-red-900 font-mono space-y-1">
                      {report.unbalanced.map((row) => (
                        <li key={row.orderId}>
                          {row.orderId}: paid {rands(row.paid)}, split{' '}
                          {rands(row.distributed)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Figure
                  tone="headline"
                  label="Customers paid"
                  amount={rands(report.collected.total)}
                  hint={`${report.orders.total} order${
                    report.orders.total === 1 ? '' : 's'
                  }, ${report.orders.cancelled} cancelled`}
                />
                <Figure
                  label="Through LokshinEats"
                  amount={rands(report.collected.card)}
                  hint={`${report.orders.card} card order${
                    report.orders.card === 1 ? '' : 's'
                  }`}
                  icon={<CreditCard className="w-4 h-4" />}
                />
                <Figure
                  label="Cash, at the door"
                  amount={rands(report.collected.cash)}
                  hint={`${report.orders.cash} cash order${
                    report.orders.cash === 1 ? '' : 's'
                  } — this never reached us`}
                  icon={<Banknote className="w-4 h-4" />}
                />
              </div>

              <h2 className="text-lg font-bold mb-3">Where it goes</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Figure
                  label="Kitchens"
                  amount={rands(report.distributed.vendorPayouts)}
                  hint="The food, less 8% commission"
                />
                <Figure
                  label="Drivers"
                  amount={rands(report.distributed.driverPay)}
                  hint="The delivery fee, less LokshinEats' R2"
                />
                <Figure
                  label="LokshinEats earned"
                  amount={rands(report.distributed.platformRevenue)}
                  hint="Commission plus R2 a delivery — not the takings"
                  icon={<Wallet className="w-4 h-4" />}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Figure
                  tone={report.cashInDriverHands.orders > 0 ? 'warning' : 'plain'}
                  label="Cash a driver is still carrying"
                  amount={rands(report.cashInDriverHands.amount)}
                  hint={
                    report.cashInDriverHands.orders > 0
                      ? `${report.cashInDriverHands.orders} delivered order${
                          report.cashInDriverHands.orders === 1 ? '' : 's'
                        } whose kitchen has not been paid`
                      : 'Every kitchen has its cash'
                  }
                  icon={<Banknote className="w-4 h-4" />}
                />
                <Figure
                  label="Refunded"
                  amount={rands(report.refunds.total)}
                  hint={`${report.refunds.count} order${
                    report.refunds.count === 1 ? '' : 's'
                  } refunded in whole or in part`}
                  icon={<Undo2 className="w-4 h-4" />}
                />
              </div>

              <p className="text-xs text-gray-400 mt-6">
                A South African day, midnight to midnight. Orders are counted
                by when they were placed, and each one is split by the rates
                frozen onto it at that moment — so a change to the rates never
                rewrites a day that has already happened.
              </p>
            </>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
