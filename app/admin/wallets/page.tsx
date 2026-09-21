'use client';

// Admin / Wallets
// Where the money actually is, and the entries that put it there.
//
// Opens on the platform's own wallet — commission in, goodwill out — and any
// other wallet by its owner (?owner=<uid>), which the People page links to.
// Read-only. An admin's manual credit is paid from the platform wallet as
// goodwill, in the same transaction as the credit, so it shows up here as a
// matching pair — a goodwill debit on the platform and the credit on the
// recipient — rather than money appearing from nowhere.
//
// The one thing this page checks rather than just shows: that a wallet's
// balance agrees with its own ledger. Every entry records the balance it left
// behind, so the newest entry in each bucket should equal what the wallet
// says it holds. When they differ, something wrote to one without the other.

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Landmark,
  Search,
  Wallet,
} from 'lucide-react';

import RoleGuard from '../../../components/RoleGuard';
import { ApiError } from '../../../services/apiClient';
import {
  PLATFORM_WALLET,
  fetchLedger,
  fetchUser,
  fetchWallet,
  type AdminUser,
  type AdminWallet,
  type LedgerEntry,
  type LedgerEntryType,
} from '../../../services/adminApi';

const typeLabel: Record<LedgerEntryType, string> = {
  order_earning: 'Order earnings',
  commission: 'Commission',
  refund: 'Refund',
  bonus: 'Bonus',
  withdrawal: 'Withdrawal',
  adjustment: 'Adjustment',
  goodwill: 'Goodwill',
};

function rands(amount: number): string {
  return `R${amount.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function signedRands(amount: number): string {
  if (Math.abs(amount) < 0.005) return rands(0);
  return `${amount < 0 ? '−' : '+'}${rands(Math.abs(amount))}`;
}

function when(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-ZA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type BucketCheck =
  | { bucket: 'available' | 'pending'; checked: false }
  | {
      bucket: 'available' | 'pending';
      checked: true;
      ok: boolean;
      wallet: number;
      ledger: number;
      /** No entry has ever landed in this bucket. */
      neverUsed: boolean;
    };

/**
 * Does the wallet agree with its own ledger?
 *
 * The ledger is newest first, so the first entry in each bucket carries the
 * balance that bucket should hold now.
 *
 * A bucket with no entry among those loaded is only checkable once the whole
 * ledger is loaded: then it has never had an entry, so it must hold nothing —
 * and a bucket holding money with no entry ever written is precisely the
 * discrepancy this exists to catch. With older entries still unloaded, the
 * answer could be further back, so it says so rather than passing.
 */
function reconcile(
  wallet: AdminWallet,
  entries: LedgerEntry[],
  complete: boolean,
): BucketCheck[] {
  return (['available', 'pending'] as const).map((bucket) => {
    const latest = entries.find((entry) => entry.balance === bucket);
    const held =
      bucket === 'available' ? wallet.availableBalance : wallet.pendingBalance;

    if (!latest) {
      if (!complete) return { bucket, checked: false };
      return {
        bucket,
        checked: true,
        ok: Math.abs(held) < 0.005,
        wallet: held,
        ledger: 0,
        neverUsed: true,
      };
    }

    return {
      bucket,
      checked: true,
      // Amounts are rands to the cent; anything under half a cent is float
      // noise, not a discrepancy.
      ok: Math.abs(latest.balanceAfter - held) < 0.005,
      wallet: held,
      ledger: latest.balanceAfter,
      neverUsed: false,
    };
  });
}

function WalletsView() {
  const router = useRouter();
  const params = useSearchParams();
  const owner = params.get('owner') || PLATFORM_WALLET;
  const isPlatform = owner === PLATFORM_WALLET;

  const [wallet, setWallet] = useState<AdminWallet | null>(null);
  const [person, setPerson] = useState<AdminUser | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [w, page, who] = await Promise.all([
          fetchWallet(owner),
          fetchLedger(owner),
          // The platform is not a person; anyone else gets a name.
          isPlatform ? Promise.resolve(null) : fetchUser(owner).catch(() => null),
        ]);
        if (cancelled) return;
        setWallet(w);
        setEntries(page.entries);
        setNextCursor(page.nextCursor);
        setPerson(who);
      } catch (err) {
        if (cancelled) return;
        setWallet(null);
        setEntries([]);
        setError(
          err instanceof ApiError ? err.message : 'Could not reach the API.',
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [owner, isPlatform]);

  const loadMore = async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await fetchLedger(owner, nextCursor);
      setEntries((current) => [...current, ...page.entries]);
      setNextCursor(page.nextCursor);
    } catch {
      // Leave what is shown; the button stays for another try.
    } finally {
      setIsLoadingMore(false);
    }
  };

  const checks = useMemo(
    () => (wallet ? reconcile(wallet, entries, nextCursor === null) : []),
    [wallet, entries, nextCursor],
  );
  const mismatched = checks.some((c) => c.checked && !c.ok);

  // For the platform: what came in and what went out, over what is loaded.
  const flows = useMemo(() => {
    const sum = (types: LedgerEntryType[]) =>
      entries
        .filter((e) => types.includes(e.type))
        .reduce((total, e) => total + e.amount, 0);
    return {
      commission: sum(['commission']),
      goodwill: sum(['goodwill']),
      other: sum(['refund', 'bonus', 'adjustment', 'withdrawal', 'order_earning']),
    };
  }, [entries]);

  const openWallet = (id: string) => {
    const trimmed = id.trim();
    router.push(
      trimmed && trimmed !== PLATFORM_WALLET
        ? `/admin/wallets?owner=${encodeURIComponent(trimmed)}`
        : '/admin/wallets',
    );
  };

  const title = isPlatform
    ? 'Platform wallet'
    : person?.displayName || person?.email || 'Wallet';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white">
        <div className="container mx-auto px-4 py-6">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Operator console
          </Link>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            {isPlatform ? (
              <Landmark className="w-7 h-7" />
            ) : (
              <Wallet className="w-7 h-7" />
            )}
            {title}
          </h1>
          <p className="text-white/70">
            {isPlatform
              ? 'What LokshinEats has actually earned, after everything it has paid out'
              : `${person?.role ? `${person.role[0].toUpperCase()}${person.role.slice(1)} · ` : ''}${person?.email ?? owner}`}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <form
          className="flex flex-wrap items-center gap-2 mb-6"
          onSubmit={(e) => {
            e.preventDefault();
            openWallet(lookup);
          }}
        >
          {!isPlatform && (
            <button
              type="button"
              onClick={() => openWallet(PLATFORM_WALLET)}
              className="px-3 py-1.5 rounded-full text-sm font-medium bg-white border border-gray-200 hover:border-gray-300"
            >
              ← Platform wallet
            </button>
          )}
          <label className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              placeholder="Open a wallet by account id (or pick one on People)"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold"
          >
            Open
          </button>
        </form>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 mb-6">
            <p className="font-semibold mb-1">Could not load this wallet</p>
            <p>{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading wallet…</div>
        ) : wallet ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <BalanceCard
                label="Available"
                value={rands(wallet.availableBalance)}
                note="Cleared, and what could be paid out"
              />
              <BalanceCard
                label="Pending"
                value={rands(wallet.pendingBalance)}
                note="Earned on orders not yet delivered"
              />
              <BalanceCard
                label="Total"
                value={rands(wallet.totalBalance)}
                note={`Updated ${when(wallet.updatedAt)}`}
              />
            </div>

            <div
              className={`rounded-xl p-4 mb-6 border ${
                mismatched
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : 'bg-green-50 border-green-200 text-green-900'
              }`}
            >
              <p className="font-semibold flex items-center gap-2">
                {mismatched ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {mismatched
                  ? 'This wallet does not agree with its ledger'
                  : 'Balance agrees with its ledger'}
              </p>
              <ul className="text-sm mt-2 space-y-0.5">
                {checks.map((c) => (
                  <li key={c.bucket}>
                    <span className="capitalize">{c.bucket}</span>:{' '}
                    {!c.checked
                      ? 'no entry among those loaded — load older entries to check'
                      : c.ok
                        ? c.neverUsed
                          ? `${rands(0)} — nothing has ever gone through it`
                          : `${rands(c.wallet)} — matches the latest entry`
                        : `wallet says ${rands(c.wallet)}, the ledger says ${rands(c.ledger)}`}
                  </li>
                ))}
              </ul>
              {mismatched && (
                <p className="text-sm mt-2">
                  Something changed the balance without writing a ledger entry,
                  or the other way round. Nothing here fixes it — it needs a
                  look at what wrote to this wallet.
                </p>
              )}
            </div>

            {isPlatform && entries.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <BalanceCard
                  label="Commission in"
                  value={signedRands(flows.commission)}
                  note={`Over the ${entries.length} entries shown`}
                />
                <BalanceCard
                  label="Goodwill out"
                  value={signedRands(flows.goodwill)}
                  note="What the platform covered on cancellations"
                />
                <BalanceCard
                  label="Everything else"
                  value={signedRands(flows.other)}
                  note="Reversals and adjustments"
                />
              </div>
            )}

            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-bold">Ledger</h2>
                <span className="text-sm text-gray-500">
                  {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                  {nextCursor ? ' so far' : ''}
                </span>
              </div>

              {entries.length === 0 ? (
                <p className="text-center text-gray-400 py-12">
                  No money has moved through this wallet yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="text-left px-5 py-2 font-semibold">When</th>
                        <th className="text-left px-3 py-2 font-semibold">What</th>
                        <th className="text-left px-3 py-2 font-semibold">Order</th>
                        <th className="text-right px-3 py-2 font-semibold">Amount</th>
                        <th className="text-right px-5 py-2 font-semibold">Balance after</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {entries.map((e) => (
                        <tr key={e.id}>
                          <td className="px-5 py-2.5 whitespace-nowrap text-gray-500">
                            {when(e.createdAt)}
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium">{typeLabel[e.type] ?? e.type}</p>
                            <p className="text-xs text-gray-500">{e.description}</p>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-gray-500">
                            {e.orderId ? `#${e.orderId.slice(0, 6)}` : '—'}
                          </td>
                          <td
                            className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${
                              e.amount < 0 ? 'text-red-700' : 'text-green-700'
                            }`}
                          >
                            {signedRands(e.amount)}
                          </td>
                          <td className="px-5 py-2.5 text-right whitespace-nowrap text-gray-600">
                            {rands(e.balanceAfter)}
                            <span className="ml-1 text-xs text-gray-400">
                              {e.balance}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {nextCursor && (
                <div className="px-5 py-4 border-t border-gray-100 text-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="text-sm font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    {isLoadingMore ? 'Loading…' : 'Load older entries'}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function BalanceCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-md p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{note}</p>
    </div>
  );
}

export default function AdminWalletsPage() {
  return (
    <RoleGuard allowedRoles={['admin']}>
      {/* useSearchParams needs a Suspense boundary, or a production build of
          this page fails outright — the dev server never shows that. */}
      <Suspense
        fallback={<div className="p-8 text-center text-gray-400">Loading wallet…</div>}
      >
        <WalletsView />
      </Suspense>
    </RoleGuard>
  );
}
