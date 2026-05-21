'use client';

// useVendorStore
// Resolves the currently-logged-in vendor's primary store.
// Encapsulates onAuthStateChanged + Firestore lookup so vendor pages don't repeat the boilerplate.
//
// Assumption: one store per vendor. If we ever support multi-store, return `stores: Store[]` instead.

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

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
  isOpen: boolean;
  categories: string[];
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
        const snapshot = await getDocs(
          query(collection(db, 'stores'), where('ownerId', '==', u.uid), limit(1)),
        );
        if (cancelled) return;

        if (snapshot.empty) {
          setStore(null);
        } else {
          const d = snapshot.docs[0];
          const data = d.data();
          setStore({
            id: d.id,
            name: data.name ?? 'Unnamed',
            cuisine: data.cuisine ?? '',
            description: data.description ?? '',
            ownerId: data.ownerId,
            image: data.image ?? '🍽️',
            address: data.address ?? '',
            city: data.city ?? '',
            rating: typeof data.rating === 'number' ? data.rating : 0,
            reviewCount: typeof data.reviewCount === 'number' ? data.reviewCount : 0,
            deliveryTime: data.deliveryTime ?? '—',
            deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 0,
            minOrderAmount: typeof data.minOrderAmount === 'number' ? data.minOrderAmount : 0,
            isOpen: data.isOpen !== false,
            categories: Array.isArray(data.categories) ? data.categories : [],
          });
        }
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
