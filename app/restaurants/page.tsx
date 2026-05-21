'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Star, Clock, Motorbike, Filter } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';

type RestaurantCard = {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  reviewCount: number;
  deliveryTime: string;
  deliveryFee: number;
  minOrderAmount: number;
  isOpen: boolean;
  categories: string[];
  image: string;
};

export default function RestaurantsPage() {
  const [restaurants, setRestaurants] = useState<RestaurantCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showFilter, setShowFilter] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const snapshot = await getDocs(collection(db, 'stores'));
        const items: RestaurantCard[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? 'Unnamed',
            cuisine: data.cuisine ?? '',
            rating: typeof data.rating === 'number' ? data.rating : 0,
            reviewCount: typeof data.reviewCount === 'number' ? data.reviewCount : 0,
            deliveryTime: data.deliveryTime ?? '—',
            deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 0,
            minOrderAmount: typeof data.minOrderAmount === 'number' ? data.minOrderAmount : 0,
            isOpen: data.isOpen !== false,
            categories: Array.isArray(data.categories) ? data.categories : [],
            image: data.image ?? '🍽️',
          };
        });
        if (!cancelled) {
          setRestaurants(items);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(restaurants.flatMap((r) => r.categories)))],
    [restaurants],
  );

  const filteredRestaurants = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return restaurants.filter((restaurant) => {
      const matchesSearch =
        restaurant.name.toLowerCase().includes(q) || restaurant.cuisine.toLowerCase().includes(q);
      const matchesCategory =
        selectedCategory === 'All' || restaurant.categories.includes(selectedCategory);
      return matchesSearch && matchesCategory;
    });
  }, [restaurants, searchQuery, selectedCategory]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold mb-4">Restaurants Near You</h1>

          {/* Search Bar */}
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search restaurants or cuisines..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-2">
            <button
              onClick={() => setShowFilter(!showFilter)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 whitespace-nowrap"
            >
              <Filter className="w-4 h-4" />
              Filter
            </button>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                  selectedCategory === category
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Restaurant List */}
      <div className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-md overflow-hidden animate-pulse">
                <div className="h-48 bg-gray-200" />
                <div className="p-4 space-y-3">
                  <div className="h-5 bg-gray-200 rounded w-2/3" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                  <div className="h-4 bg-gray-200 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : errorMessage ? (
          <div className="text-center py-12">
            <p className="text-red-600 font-semibold mb-2">Could not load restaurants</p>
            <p className="text-gray-500 text-sm font-mono break-all">{errorMessage}</p>
          </div>
        ) : restaurants.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-700 text-lg font-semibold mb-2">No restaurants yet</p>
            <p className="text-gray-500 mb-4">
              Firestore has no stores. Visit{' '}
              <Link href="/seed" className="text-primary underline">
                /seed
              </Link>{' '}
              to populate sample data.
            </p>
          </div>
        ) : filteredRestaurants.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No restaurants found matching your search</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRestaurants.map((restaurant, index) => (
              <motion.div
                key={restaurant.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Link href={`/restaurants/${restaurant.id}`}>
                  <div className="bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
                    {/* Restaurant Image */}
                    <div className="h-48 bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-7xl relative">
                      {restaurant.image}
                      {!restaurant.isOpen && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <span className="text-white font-bold text-lg">Closed</span>
                        </div>
                      )}
                    </div>

                    {/* Restaurant Info */}
                    <div className="p-4">
                      <h3 className="font-bold text-xl mb-1">{restaurant.name}</h3>
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

                      <div className="flex items-center justify-between text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Motorbike className="w-4 h-4" />
                          <span>R{restaurant.deliveryFee} delivery</span>
                        </div>
                        <span>Min: R{restaurant.minOrderAmount}</span>
                      </div>
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
