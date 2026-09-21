'use client';

// Admin / People
// Everyone with an account, what they are allowed to do, and the one control
// that changes it.
//
// A role is the whole of what an account may do on LokshinEats, so changing
// one is never a small click: the confirmation says what the new role can do
// and what the old one loses. It takes effect at once in both directions —
// the API ends the person's current session, so a removed role stops working
// now rather than when their sign-in happens to expire, and they sign in
// again to pick up the new one.
//
// Nobody can change their own role here. The API already refuses an admin
// removing their own admin rights; the page does not offer the control.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, Shield, UserCog, Users } from 'lucide-react';
import toast from 'react-hot-toast';

import RoleGuard from '../../../components/RoleGuard';
import { auth } from '../../../firebase/config';
import { ApiError } from '../../../services/apiClient';
import {
  fetchUsers,
  setUserRole,
  type AdminUser,
  type UserRole,
} from '../../../services/adminApi';

const ROLES: UserRole[] = ['customer', 'driver', 'vendor', 'admin'];

const roleStyle: Record<UserRole, { label: string; color: string }> = {
  customer: { label: 'Customer', color: 'bg-gray-100 text-gray-700' },
  driver: { label: 'Driver', color: 'bg-blue-100 text-blue-700' },
  vendor: { label: 'Vendor', color: 'bg-amber-100 text-amber-800' },
  admin: { label: 'Admin', color: 'bg-red-100 text-red-700' },
};

/** What a role lets someone do, in the words the confirmation uses. */
const roleGrants: Record<UserRole, string> = {
  customer: 'order food and track their own orders',
  driver:
    'see and claim deliveries, and carry customers’ food and cash',
  vendor:
    'run a kitchen: take orders, set its menu, and be paid for what it cooks',
  admin:
    'see every order, wallet and account on the platform, cancel any order, and change anyone’s role — including yours',
};

/**
 * The confirmation for a role change.
 *
 * Says what the new role can do, and what goes with the old one, because
 * that is what the admin is actually deciding.
 */
function describeChange(user: AdminUser, next: UserRole): string {
  const who = user.displayName || user.email;
  const lines = [
    `Make ${who} a ${roleStyle[next].label.toLowerCase()}?`,
    '',
    `They will be able to ${roleGrants[next]}.`,
  ];

  if (user.role === 'vendor' && next !== 'vendor') {
    lines.push(
      '',
      'Their kitchen stays listed, but they will no longer be able to manage it or see its orders.',
    );
  }
  if (user.role === 'driver' && next !== 'driver') {
    lines.push(
      '',
      'Any delivery they are carrying stays assigned to them and will need sorting out.',
    );
  }
  if (next === 'admin') {
    lines.push('', 'Only do this for someone you would trust with the platform.');
  }

  lines.push(
    '',
    'They will be signed out and need to sign in again. The change applies immediately.',
  );
  return lines.join(String.fromCharCode(10));
}

function joined(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type RoleFilter = UserRole | 'all';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RoleFilter>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Whoever is looking. Their own row gets no role control.
  const myUid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const page = await fetchUsers({
          role: filter === 'all' ? undefined : filter,
        });
        if (cancelled) return;
        setUsers(page.users);
        setNextCursor(page.nextCursor);
        setError(null);
      } catch (err) {
        if (cancelled) return;
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
  }, [filter]);

  const loadMore = async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await fetchUsers({
        cursor: nextCursor,
        role: filter === 'all' ? undefined : filter,
      });
      setUsers((current) => [...current, ...page.users]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not load more people.',
      );
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleRoleChange = async (user: AdminUser, next: UserRole) => {
    if (next === user.role || typeof window === 'undefined') return;
    if (!window.confirm(describeChange(user, next))) return;

    setBusyId(user.id);
    try {
      const updated = await setUserRole(user.id, next);
      setUsers((current) =>
        current
          .map((u) => (u.id === updated.id ? { ...u, role: updated.role } : u))
          // Under a role filter, someone who no longer holds it leaves the list.
          .filter((u) => filter === 'all' || u.role === filter),
      );
      toast.success(
        `${user.displayName || user.email} is now a ${roleStyle[next].label.toLowerCase()}.`,
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not change that role.',
      );
    } finally {
      setBusyId(null);
    }
  };

  // Search narrows what is already loaded. The API filters by role; a name or
  // email search across every account belongs on the server once there are
  // enough people for it to matter.
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(needle) ||
        u.displayName.toLowerCase().includes(needle) ||
        (u.phone ?? '').includes(needle),
    );
  }, [users, search]);

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
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Users className="w-7 h-7" />
              People
            </h1>
            <p className="text-white/70">
              Everyone with an account, and what they are allowed to do
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 mb-6">
              <p className="font-semibold mb-1">Could not load people</p>
              <p>{error}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2 overflow-x-auto">
              {(['all', ...ROLES] as RoleFilter[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setFilter(r)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    filter === r
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {r === 'all' ? 'Everyone' : `${roleStyle[r].label}s`}
                </button>
              ))}
            </div>

            <label className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email or phone"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>

          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center text-gray-400">Loading people…</div>
            ) : shown.length === 0 ? (
              <div className="text-center py-16 px-4">
                <UserCog className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Nobody here</p>
                <p className="text-sm text-gray-400">
                  {search
                    ? 'Nobody loaded matches that search.'
                    : 'No accounts hold this role yet.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {shown.map((u) => {
                  const style = roleStyle[u.role];
                  const isMe = u.id === myUid;

                  return (
                    <li
                      key={u.id}
                      className="px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">
                          {u.displayName || 'No name'}
                          {isMe && (
                            <span className="ml-2 text-xs font-normal text-gray-400">
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {u.email}
                          {u.phone ? ` · ${u.phone}` : ''} · joined{' '}
                          {joined(u.createdAt)}
                        </p>
                      </div>

                      <Link
                        href={`/admin/wallets?owner=${encodeURIComponent(u.id)}`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Wallet
                      </Link>

                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${style.color}`}
                      >
                        {u.role === 'admin' && <Shield className="w-3 h-3" />}
                        {style.label}
                      </span>

                      {isMe ? (
                        <span className="text-xs text-gray-400 w-36 text-right">
                          Another admin can change this
                        </span>
                      ) : (
                        <select
                          aria-label={`Change role for ${u.displayName || u.email}`}
                          value={u.role}
                          disabled={busyId === u.id}
                          onChange={(e) =>
                            handleRoleChange(u, e.target.value as UserRole)
                          }
                          className="w-36 px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm disabled:opacity-50"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {roleStyle[r].label}
                            </option>
                          ))}
                        </select>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {nextCursor && !isLoading && (
              <div className="px-5 py-4 border-t border-gray-100 text-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="text-sm font-semibold text-primary hover:underline disabled:opacity-50"
                >
                  {isLoadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 mt-4">
            Changing a role signs the person out and applies at once. Vendors
            usually get their role by registering a kitchen in the vendor app,
            not from here.
          </p>
        </div>
      </div>
    </RoleGuard>
  );
}
