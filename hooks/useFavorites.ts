'use client';

// useFavorites
// Reads/writes the current user's favorite store IDs as a plain string array
// on users/{uid}.favorites. Optimistic toggles for snappy UI; rolls back on
// error.

import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { arrayRemove, arrayUnion, doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUserId(null);
        setFavorites([]);
        setIsLoading(false);
        return;
      }
      setUserId(u.uid);
      try {
        const snap = await getDoc(doc(db, 'users', u.uid));
        if (snap.exists()) {
          const favs = snap.data().favorites;
          setFavorites(Array.isArray(favs) ? favs : []);
        } else {
          setFavorites([]);
        }
      } catch {
        // ignore — user just sees empty favorites
      }
      setIsLoading(false);
    });
    return unsub;
  }, []);

  const isFavorite = useCallback(
    (storeId: string) => favorites.includes(storeId),
    [favorites],
  );

  const toggleFavorite = useCallback(
    async (storeId: string) => {
      if (!userId) return;
      const currentlyFavorited = favorites.includes(storeId);
      // Optimistic update
      setFavorites((prev) =>
        currentlyFavorited ? prev.filter((f) => f !== storeId) : [...prev, storeId],
      );
      try {
        await setDoc(
          doc(db, 'users', userId),
          { favorites: currentlyFavorited ? arrayRemove(storeId) : arrayUnion(storeId) },
          { merge: true },
        );
      } catch {
        // Rollback on error
        setFavorites((prev) =>
          currentlyFavorited ? [...prev, storeId] : prev.filter((f) => f !== storeId),
        );
      }
    },
    [userId, favorites],
  );

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    isLoading,
    isSignedIn: !!userId,
  };
}
