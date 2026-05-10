'use client';

// Restaurant Listing Page
// Shows all available restaurants with filtering

import { useState } from 'react';
import { Search, Star, Clock, Motorbike, Filter } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

// Mock data for restaurants (will be replaced with Firebase data)
const mockRestaurants = [
  {
    id: '1',
    name: "Mama's Kitchen",
    cuisine: "Traditional Township Food",
    rating: 4.8,
    reviewCount: 234,
    deliveryTime: "25-35 min",
    deliveryFee: 15,
    minOrderAmount: 50,
    isOpen: true,
    categories: ['Traditional', 'Pap & Vleis', 'Braai'],
    image: '🍲'
  },
  {
    id: '2',
    name: 'Kota King',
    cuisine: 'Kota Specialist',
    rating: 4.6,
    reviewCount: 189,
    deliveryTime: '20-30 min',
    deliveryFee: 10,
    minOrderAmount: 40,
    isOpen: true,
    categories: ['Kota', 'Fast Food'],
    image: '🍔'
  },
  {
    id: '3',
    name: 'Braai Master',
    cuisine: 'Braai & Grills',
    rating: 4.9,
    reviewCount: 312,
    deliveryTime: '30-45 min',
    deliveryFee: 20,
    minOrderAmount: 60,
    isOpen: true,
    categories: ['Braai', 'Grill', 'Meat'],
    image: '🍖'
  },
  {
    id: '4',
    name: 'Spaza Shop Express',
    cuisine: 'Groceries & Essentials',
    rating: 4.4,
    reviewCount: 98,
    deliveryTime: '15-25 min',
    deliveryFee: 12,
    minOrderAmount: 30,
    isOpen: true,
    categories: ['Groceries', 'Essentials'],
    image: '🛒'
  },
  {
    id: '5',
    name: 'Bunny Chow House',
    cuisine: 'Bunny Chow & Curries',
    rating: 4.7,
    reviewCount: 156,
    deliveryTime: '25-40 min',
    deliveryFee: 15,
    minOrderAmount: 45,
    isOpen: false,
    categories: ['Bunny Chow', 'Curry', 'Indian'],
    image: '🥘'
  },
  {
    id: '6',
    name: 'Sweet Treats Bakery',
    cuisine: 'Bakery & Sweets',
    rating: 4.5,
    reviewCount: 87,
    deliveryTime: '20-30 min',
    deliveryFee: 10,
    minOrderAmount: 35,
    isOpen: true,
    categories: ['Bakery', 'Sweets', 'Cakes'],
    image: '🍰'
  },
];

export default function RestaurantsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showFilter, setShowFilter] = useState(false);

  const categories = ['All', ...new Set(mockRestaurants.flatMap(r => r.categories))];

  const filteredRestaurants = mockRestaurants.filter(restaurant => {
    const matchesSearch = restaurant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         restaurant.cuisine.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || restaurant.categories.includes(selectedCategory);
    return matchesSearch && matchesCategory;
  });

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
        {filteredRestaurants.length === 0 ? (
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
