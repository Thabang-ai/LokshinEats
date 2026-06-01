'use client';

import { useEffect, useState } from 'react';
import { Search, MapPin, Star, Clock, Motorbike } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase/config';
import RoleGuard from '../components/RoleGuard';

type FeaturedRestaurant = {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  deliveryTime: string;
  deliveryFee: number;
  image: string;
};

function isImageUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export default function Home() {
  const [featured, setFeatured] = useState<FeaturedRestaurant[]>([]);
  const [isLoadingFeatured, setIsLoadingFeatured] = useState(true);
  const [featuredError, setFeaturedError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const snapshot = await getDocs(
          query(collection(db, 'stores'), orderBy('rating', 'desc'), limit(3)),
        );
        const items: FeaturedRestaurant[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? 'Unnamed',
            cuisine: data.cuisine ?? '',
            rating: typeof data.rating === 'number' ? data.rating : 0,
            deliveryTime: data.deliveryTime ?? '—',
            deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 0,
            image: data.image ?? '🍽️',
          };
        });
        if (!cancelled) {
          setFeatured(items);
          setIsLoadingFeatured(false);
        }
      } catch (err) {
        if (!cancelled) {
          setFeaturedError(err instanceof Error ? err.message : String(err));
          setIsLoadingFeatured(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RoleGuard allowedRoles={['customer']}>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gray-900 text-white py-20 md:py-32 px-4">
        {/* Background image with overlay */}
        <div className="absolute inset-0">
          <img src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1600&h=800&fit=crop" alt="Delicious township food" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/30"></div>
        </div>
        
        <div className="container mx-auto max-w-6xl relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              Township Flavors,<br />
              <span className="text-[#FFB347]">Delivered to You</span>
            </h1>
            <p className="text-xl md:text-2xl mb-10 text-white/90 max-w-2xl">
              Experience authentic township cuisine from the best local restaurants, spaza shops, and home cooks
            </p>

            {/* Location and Search */}
            <div className="glass-card rounded-3xl p-6 max-w-2xl bg-white/10 backdrop-blur-md border border-white/20">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <MapPin className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Enter your delivery location"
                    className="w-full pl-12 pr-4 py-4 bg-white border-0 rounded-2xl focus:outline-none focus:ring-4 focus:ring-primary/50 text-gray-900 placeholder-gray-500 shadow-inner"
                  />
                </div>
                <Link href="/restaurants" className="premium-button text-white px-8 py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2">
                  <Search className="w-5 h-5" />
                  Find Food
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-8" style={{background: 'linear-gradient(135deg, #FF4500, #FF6B35)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'}}>What are you craving?</h2>
          </motion.div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { name: 'Kota', image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&h=500&fit=crop' },
              { name: 'Braai', image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&h=500&fit=crop' },
              { name: 'Pap & Vleis', image: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=500&h=500&fit=crop' },
              { name: 'Fast Food', image: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=500&h=500&fit=crop' },
              { name: 'Groceries', image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&h=500&fit=crop' },
              { name: 'Drinks', image: 'https://images.unsplash.com/photo-1556881286-fc6915169721?w=500&h=500&fit=crop' },
              { name: 'Bunny Chow', image: 'https://images.unsplash.com/photo-1606471191009-63994c53433b?w=500&h=500&fit=crop' },
              { name: 'Sweets', image: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=500&h=500&fit=crop' },
            ].map((category, index) => (
              <Link
                key={category.name}
                href={`/restaurants?category=${encodeURIComponent(category.name)}`}
                className="block"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ scale: 1.05, y: -5 }}
                  className="premium-card p-4 flex flex-col items-center gap-3 cursor-pointer bg-white group"
                >
                  <div className="w-24 h-24 rounded-full overflow-hidden shadow-md group-hover:shadow-lg transition-shadow border-4 border-white">
                    <img src={category.image} alt={category.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  </div>
                  <span className="font-bold text-gray-900 group-hover:text-primary transition-colors">{category.name}</span>
                </motion.div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Restaurants */}
      <section className="py-16 px-4 bg-gradient-to-b from-[#FFF3E0] to-white">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-8" style={{background: 'linear-gradient(135deg, #FF4500, #FF6B35)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'}}>Popular Near You</h2>
          </motion.div>
          {isLoadingFeatured ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="premium-card overflow-hidden animate-pulse">
                  <div className="h-48 bg-gray-200" />
                  <div className="p-6 space-y-3">
                    <div className="h-5 bg-gray-200 rounded w-2/3" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                    <div className="h-4 bg-gray-200 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : featuredError ? (
            <div className="text-center py-8">
              <p className="text-red-600 font-semibold mb-1">Could not load featured restaurants</p>
              <p className="text-gray-500 text-sm font-mono break-all">{featuredError}</p>
            </div>
          ) : featured.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-700 text-lg font-semibold mb-2">No restaurants yet</p>
              <p className="text-gray-500">
                No restaurants are open in your area yet. Check back soon!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {featured.map((restaurant, index) => (
                <Link href={`/restaurants/${restaurant.id}`} key={restaurant.id}>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.02, y: -8 }}
                    className="premium-card overflow-hidden cursor-pointer group"
                  >
                    <div className="h-48 relative overflow-hidden">
                      {isImageUrl(restaurant.image) ? (
                        <>
                          <img src={restaurant.image} alt={restaurant.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </>
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-7xl group-hover:scale-105 transition-transform duration-700">
                          {restaurant.image}
                        </div>
                      )}
                    </div>
                    <div className="p-6 relative">
                      <h3 className="font-bold text-xl mb-2 group-hover:text-primary transition-colors">{restaurant.name}</h3>
                      <p className="text-gray-600 text-sm mb-4">{restaurant.cuisine}</p>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                          <span className="font-bold text-lg">{restaurant.rating}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Clock className="w-5 h-5" />
                          <span>{restaurant.deliveryTime}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 bg-orange-50 px-2 py-1 rounded-full">
                          <Motorbike className="w-4 h-4 text-primary" />
                          <span className="font-bold text-primary">R{restaurant.deliveryFee}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center" style={{background: 'linear-gradient(135deg, #FF4500, #FF6B35)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'}}>How LokshinEats Works</h2>
          </motion.div>
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
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="premium-card p-8 text-center"
              >
                <div className="w-20 h-20 premium-button rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-6">
                  {item.step}
                </div>
                <h3 className="font-bold text-xl mb-3">{item.title}</h3>
                <p className="text-gray-600">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#FF4500] via-[#FF6B35] to-[#FF8B5A]"></div>
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-[#FFD700]/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-[#FFB347]/20 rounded-full blur-3xl"></div>
        </div>
        <div className="container mx-auto max-w-4xl text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white">Ready to Order?</h2>
            <p className="text-xl md:text-2xl mb-10 text-white/90 max-w-2xl mx-auto">
              Support local township businesses and enjoy delicious food delivered to your door
            </p>
            <Link href="/restaurants" className="inline-block bg-white text-primary px-10 py-5 rounded-2xl font-bold text-lg hover:bg-gray-100 transition-all hover:scale-105 shadow-2xl">
              Browse Restaurants
            </Link>
          </motion.div>
        </div>
      </section>
    </div>
    </RoleGuard>
  );
}
