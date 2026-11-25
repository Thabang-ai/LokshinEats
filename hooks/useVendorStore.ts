'use client';

// useVendorStore
// Resolves the currently-logged-in vendor's own kitchen.
// Encapsulates onAuthStateChanged + the API call so vendor pages don't repeat
// the boilerplate.
//
// Reads GET /api/v1/stores/mine rather than querying Firestore by ownerId:
// the API is what applies the platform delivery fee, the opening hours and
// the review queue, so a dashboard reading the raw document shows its owner a
// kitchen in a state the rest of the platform disagrees with.
//
// Assumption: one store per vendor. If we ever support multi-store, return
// `stores: Store[]` instead.

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../firebase/config';
import { fetchMyStore } from '../services/storeApi';

export type VendorStore = {
  id: string;
  name: string;
  cuisine: string;
  description: string;
  ownerId: string;
  image: string;
  address: string;
  city: string;
  rating: number;
  reviewCount: number;
  deliveryTime: string;
  deliveryFee: number;
  minOrderAmount: number;
  /** Taking orders right now: the vendor's switch AND the clock. */
  isOpen: boolean;
  /** The switch on its own, which is what the dashboard's toggle shows. */
  switchedOn: boolean;
  categories: string[];
  /** Whether LokshinEats has let this kitchen trade. */
  verification: 'pending' | 'approved' | 'rejected';
  verificationReason: string | null;
};

type State = {
  user: User | null;
  store: VendorStore | null;
  isLoading: boolean;
  error: string | null;
};

export function useVendorStore(): State {
  const [user, setUser] = useState<User | null>(null);
  const [store, setStore] = useState<VendorStore | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (cancelled) return;
      setUser(u);

      if (!u) {
        setStore(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const mine = await fetchMyStore();
        if (cancelled) return;

        setStore(
          mine === null
            ? null
            : {
                id: mine.id,
                name: mine.name || 'Unnamed',
                cuisine: mine.cuisine,
                description: mine.description,
                ownerId: mine.ownerId,
                image: mine.image ?? '🍽️',
                address: mine.address,
                city: mine.city,
                rating: mine.rating,
                reviewCount: mine.reviewCount,
                deliveryTime: mine.deliveryTime || '—',
                deliveryFee: mine.deliveryFee,
                minOrderAmount: mine.minOrderAmount,
                isOpen: mine.isOpen,
                switchedOn: mine.switchedOn,
                categories: mine.categories,
                verification: mine.verification,
                verificationReason: mine.verificationReason,
              },
        );
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { user, store, isLoading, error };
}
