'use client';

// Favorites Page
// Shows user's favorite restaurants and items

import { useState } from 'react';
import { Heart, Star, Clock, Motorbike, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

// Mock favorite restaurants (will be replaced with Firebase)
const mockFavorites = [
  {
    id: '1',
    name: "Mama's Kitchen",
    cuisine: "Traditional Township Food",
    rating: 4.8,
    reviewCount: 234,
    deliveryTime: "25-35 min",
    deliveryFee: 15,
    image: '🍲',
    isOpen: true,
  },
  {
    id: '3',
    name: 'Braai Master',
    cuisine: 'Braai & Grills',
    rating: 4.9,
    reviewCount: 312,
    deliveryTime: '30-45 min',
    deliveryFee: 20,
    image: '🍖',
    isOpen: true,
  },
];

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState(mockFavorites);

  const removeFavorite = (id: string) => {
    setFavorites(prev => prev.filter(f => f.id !== id));
  };

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

        {favorites.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <Heart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">No favorites yet</h2>
            <p className="text-gray-600 mb-6">
              Start adding restaurants to your favorites by clicking the heart icon
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
            {favorites.map((restaurant, index) => (
              <motion.div
                key={restaurant.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow"
              >
                <Link href={`/restaurants/${restaurant.id}`}>
                  <div className="h-48 bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-7xl relative">
                    {restaurant.image}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        removeFavorite(restaurant.id);
                      }}
                      className="absolute top-4 right-4 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md hover:bg-gray-100"
                    >
                      <Heart className="w-5 h-5 text-primary fill-primary" />
                    </button>
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
