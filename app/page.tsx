'use client';

import { Search, MapPin, Star, Clock, Motorbike } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import RoleGuard from '../components/RoleGuard';

export default function Home() {
  return (
    <RoleGuard allowedRoles={['customer']}>
      <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary to-primary-dark text-white py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-6xl font-bold mb-4">
              Township Flavors,<br />Delivered to You
            </h1>
            <p className="text-xl md:text-2xl mb-8 text-white/90">
              Order from local restaurants, spaza shops, and home cooks in your area
            </p>

            {/* Location and Search */}
            <div className="bg-white rounded-2xl p-4 shadow-2xl max-w-2xl">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative">
                  <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Enter your delivery location"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-gray-900"
                  />
                </div>
                <Link href="/restaurants" className="bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2">
                  <Search className="w-5 h-5" />
                  Find Food
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-12 px-4">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-2xl md:text-3xl font-bold mb-6">What are you craving?</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'Kota', emoji: '🍔' },
              { name: 'Braai', emoji: '🍖' },
              { name: 'Pap & Vleis', emoji: '🍲' },
              { name: 'Fast Food', emoji: '🍟' },
              { name: 'Groceries', emoji: '🛒' },
              { name: 'Drinks', emoji: '🥤' },
              { name: 'Bunny Chow', emoji: '🥘' },
              { name: 'Sweets', emoji: '🍰' },
            ].map((category, index) => (
              <Link
                key={category.name}
                href="/restaurants"
                className="block"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-light-gray hover:bg-gray-200 rounded-2xl p-6 flex flex-col items-center gap-3 transition-colors cursor-pointer"
                >
                  <span className="text-4xl">{category.emoji}</span>
                  <span className="font-semibold text-gray-900">{category.name}</span>
                </motion.div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Restaurants */}
      <section className="py-12 px-4 bg-gray-50">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-2xl md:text-3xl font-bold mb-6">Popular Near You</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                name: "Mama's Kitchen",
                cuisine: "Traditional Township Food",
                rating: 4.8,
                deliveryTime: "25-35 min",
                deliveryFee: "R15",
                image: "🍲"
              },
              {
                name: "Kota King",
                cuisine: "Kota Specialist",
                rating: 4.6,
                deliveryTime: "20-30 min",
                deliveryFee: "R10",
                image: "🍔"
              },
              {
                name: "Braai Master",
                cuisine: "Braai & Grills",
                rating: 4.9,
                deliveryTime: "30-45 min",
                deliveryFee: "R20",
                image: "🍖"
              },
            ].map((restaurant, index) => (
              <motion.div
                key={restaurant.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
              >
                <div className="h-40 bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-6xl">
                  {restaurant.image}
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-lg mb-1">{restaurant.name}</h3>
                  <p className="text-gray-600 text-sm mb-3">{restaurant.cuisine}</p>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-semibold">{restaurant.rating}</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-600">
                      <Clock className="w-4 h-4" />
                      <span>{restaurant.deliveryTime}</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-600">
                      <Motorbike className="w-4 h-4" />
                      <span>{restaurant.deliveryFee}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-12 px-4">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center">How LokshinEats Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Choose Your Food",
                description: "Browse restaurants and select your favorite meals"
              },
              {
                step: "2",
                title: "Place Your Order",
                description: "Add to cart and checkout with multiple payment options"
              },
              {
                step: "3",
                title: "Get It Delivered",
                description: "Track your order as it's delivered to your door"
              },
            ].map((item, index) => (
              <div key={item.step} className="text-center">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-bold text-xl mb-2">{item.title}</h3>
                <p className="text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 bg-gradient-to-r from-primary to-primary-dark text-white">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Order?</h2>
          <p className="text-xl mb-8 text-white/90">
            Support local township businesses and enjoy delicious food delivered to your door
          </p>
          <Link href="/restaurants" className="bg-white text-primary px-8 py-4 rounded-xl font-bold text-lg hover:bg-gray-100 transition-colors">
            Browse Restaurants
          </Link>
        </div>
      </section>
    </div>
    </RoleGuard>
  );
}
