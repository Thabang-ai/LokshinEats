'use client';

// useHomeArea
// The township or city on the signed-in customer's saved address, or null.
//
// Read by anything that has to decide whether a kitchen will drive to this
// customer. Null means the site does not know where they are — signed out, or
// no address saved — and nothing may be inferred from it: a customer who has
// not said where they live is not steered away from a kitchen on a guess.
//
// Read from the customer's own `users/{uid}` document, which is where the
// profile page writes it and where checkout already reads it from. That is
// their own private document, not a kitchen's.

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthUser } from './useAuthUser';

/** What was read, and whose address it was: the answer can arrive late. */
type Resolved = { uid: string; area: string | null };

export function useHomeArea(): { homeArea: string | null; ready: boolean } {
  const { user, authReady } = useAuthUser();
  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    if (!authReady || !user) return;

    let cancelled = false;
    const uid = user.uid;

    (async () => {
      try {
        const snapshot = await getDoc(doc(db, 'users', uid));
        if (cancelled) return;

        const address = snapshot.get('address');
        const city =
          address && typeof address === 'object'
            ? (address as { city?: unknown }).city
            : null;

        setResolved({
          uid,
          area: typeof city === 'string' && city.trim() ? city.trim() : null,
        });
      } catch {
        // Not knowing is a state this is designed for, not an error worth
        // putting in front of somebody browsing for food.
        if (!cancelled) setResolved({ uid, area: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authReady]);

  // Derived rather than stored, so signing out cannot leave the last
  // customer's township behind.
  const mine = user !== null && resolved?.uid === user.uid ? resolved : null;

  return {
    homeArea: mine?.area ?? null,
    ready: authReady && (user === null || mine !== null),
  };
}
