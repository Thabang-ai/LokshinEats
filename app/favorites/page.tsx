'use client';

// Favorites Page
// Reads favorited store IDs from users/{uid}.favorites, then fetches each
// store doc in parallel. Toggle still uses the same useFavorites hook so
// optimistic updates show instantly.

import { useEffect, useState } from 'react';
import { Heart, Star, Clock, Motorbike, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useFavorites } from '../../hooks/useFavorites';

type RestaurantCard = {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  reviewCount: number;
  deliveryTime: string;
  deliveryFee: number;
  image: string;
  isOpen: boolean;
};

export default function FavoritesPage() {
  const { favorites, toggleFavorite, isSignedIn, isLoading: isFavoritesLoading } = useFavorites();
  const [stores, setStores] = useState<RestaurantCard[]>([]);
  const [isStoresLoading, setIsStoresLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isFavoritesLoading) return;
    if (favorites.length === 0) {
      setStores([]);
      setIsStoresLoading(false);
      return;
    }

    let cancelled = false;
    setIsStoresLoading(true);
    setErrorMessage(null);

    (async () => {
      try {
        const snaps = await Promise.all(
          favorites.map((id) => getDoc(doc(db, 'stores', id))),
        );
        const rows: RestaurantCard[] = snaps
          .filter((s) => s.exists())
          .map((s) => {
            const data = s.data()!;
            return {
              id: s.id,
              name: data.name ?? 'Unnamed',
              cuisine: data.cuisine ?? '',
              rating: typeof data.rating === 'number' ? data.rating : 0,
              reviewCount: typeof data.reviewCount === 'number' ? data.reviewCount : 0,
              deliveryTime: data.deliveryTime ?? '—',
              deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 0,
              image: data.image ?? '🍽️',
              isOpen: data.isOpen !== false,
            };
          });
        if (!cancelled) {
          setStores(rows);
          setIsStoresLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
          setIsStoresLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [favorites, isFavoritesLoading]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-4">
          <ArrowLeft className="w-5 h-5" />
          Back to Home
        </Link>

        <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
          <Heart className="w-8 h-8 text-primary fill-primary" />
          Your Favorites
        </h1>

        {!isSignedIn ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <Heart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Sign in to save favorites</h2>
            <p className="text-gray-600 mb-6">
              Heart your favorite restaurants once you're logged in.
            </p>
            <Link
              href="/auth/login"
              className="inline-block bg-primary text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-dark transition-colors"
            >
              Go to login
            </Link>
          </div>
        ) : isFavoritesLoading || isStoresLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-md overflow-hidden animate-pulse">
                <div className="h-48 bg-gray-200" />
                <div className="p-4 space-y-2">
                  <div className="h-5 bg-gray-200 rounded w-2/3" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : errorMessage ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
            <p className="font-semibold mb-1">Could not load favorites</p>
            <p className="font-mono break-all">{errorMessage}</p>
          </div>
        ) : stores.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <Heart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">No favorites yet</h2>
            <p className="text-gray-600 mb-6">
              Browse restaurants and tap the heart on any you'd like to save.
            </p>
            <Link
              href="/restaurants"
              className="inline-block bg-primary text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-dark transition-colors"
            >
              Browse Restaurants
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.map((restaurant, index) => (
              <motion.div
                key={restaurant.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow relative"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleFavorite(restaurant.id);
                  }}
                  className="absolute top-3 right-3 z-10 w-9 h-9 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-md transition-colors"
                  aria-label="Remove favorite"
                >
                  <Heart className="w-5 h-5 fill-red-500 text-red-500" />
                </button>

                <Link href={`/restaurants/${restaurant.id}`}>
                  <div className="h-48 bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-7xl relative">
                    {restaurant.image}
                    {!restaurant.isOpen && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="text-white font-bold text-lg">Closed</span>
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <h3 className="font-bold text-lg mb-1">{restaurant.name}</h3>
                    <p className="text-gray-600 text-sm mb-3">{restaurant.cuisine}</p>

                    <div className="flex items-center gap-4 text-sm mb-3">
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        <span className="font-semibold">{restaurant.rating}</span>
                        <span className="text-gray-500">({restaurant.reviewCount})</span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-600">
                        <Clock className="w-4 h-4" />
                        <span>{restaurant.deliveryTime}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Motorbike className="w-4 h-4" />
                      <span>R{restaurant.deliveryFee} delivery</span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
