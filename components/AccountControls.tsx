'use client';

// Suspend, reinstate, remove — wherever an admin is looking at a person.
//
// It lives in one component because it is on two pages that are about the
// same people from different angles: People, which is every account, and
// Drivers, which is the review queue. An admin who has just turned down an
// application is already looking at the person they want to stop; sending
// them to another page to do it is how a driver carries on delivering.
//
// Every refusal here is also a refusal in the API — their own account,
// another admin's, and removing somebody still part of an unfinished order.
// A console that only hides a control is one a stale tab gets around.

import { useState } from 'react';
import { Ban, Trash2, UndoDot } from 'lucide-react';
import toast from 'react-hot-toast';

import { ApiError } from '../services/apiClient';
import {
  removeUser,
  setAccountStatus,
  type AccountStatus,
  type UserRole,
} from '../services/adminApi';

/** The parts of an account these controls need, from whichever list holds it. */
export type ControllableAccount = {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
};

/** What a suspension actually does, said before it is done. */
function describeSuspension(account: ControllableAccount): string {
  const who = account.displayName || account.email;
  const lines = [
    `Suspend ${who}?`,
    '',
    'They are signed out at once and cannot sign in again until you lift it.',
  ];

  if (account.role === 'vendor') {
    lines.push('', 'Their kitchen is closed with them, so it stops taking orders.');
  }
  if (account.role === 'driver') {
    lines.push(
      '',
      'Any delivery they are carrying stays assigned to them and will need sorting out.',
    );
  }

  return lines.join(String.fromCharCode(10));
}

function describeRemoval(account: ControllableAccount): string {
  const who = account.displayName || account.email;
  return [
    `Remove ${who} from LokshinEats?`,
    '',
    'Their sign-in is deleted. Their past orders keep their name, and the',
    'email is free again if they ever want to start over.',
    '',
    'This cannot be undone from here.',
  ].join(String.fromCharCode(10));
}

export default function AccountControls({
  account,
  isSelf,
  onChanged,
}: {
  account: ControllableAccount;
  /** Nobody shuts themselves out; the API refuses it too. */
  isSelf: boolean;
  onChanged: (status: AccountStatus, reason: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  // An admin is demoted before they can be shut out, so the controls are not
  // offered for one. A removed account has nothing left to act on.
  if (isSelf || account.role === 'admin' || account.status === 'removed') {
    return null;
  }

  const suspend = async () => {
    if (typeof window === 'undefined') return;
    if (!window.confirm(describeSuspension(account))) return;

    const reason = window.prompt(
      'Why are they being suspended? They may be told, and the next admin to look will see it.',
    );
    if (reason === null) return;

    setBusy(true);
    try {
      const updated = await setAccountStatus(
        account.id,
        'suspended',
        reason.trim(),
      );
      onChanged(updated.status, updated.statusReason);
      toast.success(`${account.displayName || account.email} is suspended.`);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Could not suspend them.',
      );
    } finally {
      setBusy(false);
    }
  };

  const reinstate = async () => {
    setBusy(true);
    try {
      const updated = await setAccountStatus(account.id, 'active');
      onChanged(updated.status, updated.statusReason);
      toast.success(`${account.displayName || account.email} is back in.`);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Could not reinstate them.',
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (typeof window === 'undefined') return;
    if (!window.confirm(describeRemoval(account))) return;

    // Typed, not clicked. The sign-in does not come back.
    const typed = window.prompt(
      `Type ${account.email} to confirm you are removing this account.`,
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== account.email.toLowerCase()) {
      toast.error('That did not match. Nothing was changed.');
      return;
    }

    const reason = window.prompt('Why are they being removed?');
    if (reason === null) return;

    setBusy(true);
    try {
      const updated = await removeUser(account.id, reason.trim());
      onChanged(updated.status, updated.statusReason);
      toast.success(`${account.displayName || account.email} has been removed.`);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Could not remove them.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {account.status === 'suspended' ? (
        <button
          type="button"
          disabled={busy}
          onClick={reinstate}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-green-700 border border-green-200 hover:bg-green-50 disabled:opacity-50"
        >
          <UndoDot className="w-3.5 h-3.5" /> Reinstate
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={suspend}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-amber-800 border border-amber-200 hover:bg-amber-50 disabled:opacity-50"
        >
          <Ban className="w-3.5 h-3.5" /> Suspend
        </button>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={remove}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-50"
      >
        <Trash2 className="w-3.5 h-3.5" /> Remove
      </button>
    </div>
  );
}

/** The chip both pages use for an account that is not simply active. */
export function AccountStatusChip({ status }: { status: AccountStatus }) {
  if (status === 'active') return null;

  const style =
    status === 'suspended'
      ? 'bg-amber-100 text-amber-800'
      : 'bg-gray-200 text-gray-600';

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${style}`}>
      {status === 'suspended' ? 'Suspended' : 'Removed'}
    </span>
  );
}
