'use client';

// useAuthUser
// Tiny wrapper around onAuthStateChanged. Returns the current auth user and a
// flag indicating whether Firebase has finished its initial auth check.
//
// Use when a page just needs "who's logged in" without any extra Firestore
// fetch. For vendor pages that also need the store, use useVendorStore instead.

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../firebase/config';

export function useAuthUser(): { user: User | null; authReady: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  return { user, authReady };
}
