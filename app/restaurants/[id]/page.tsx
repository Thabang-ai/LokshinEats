'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { Star, Clock, Motorbike, Heart, Plus, Minus, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useCart } from '../../../context/CartContext';
import type { Product } from '../../../types';

type StoreView = {
  id: string;
  name: string;
  cuisine: string;
  description: string;
  rating: number;
  reviewCount: number;
  deliveryTime: string;
  deliveryFee: number;
  minOrderAmount: number;
  isOpen: boolean;
  image: string;
  address: string;
  city: string;
};

type MenuItem = Product & { image: string };

export default function RestaurantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { addToCart } = useCart();

  const [store, setStore] = useState<StoreView | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    (async () => {
      try {
        const [storeSnap, productsSnap] = await Promise.all([
          getDoc(doc(db, 'stores', id)),
          getDocs(query(collection(db, 'products'), where('storeId', '==', id))),
        ]);

        if (cancelled) return;

        if (!storeSnap.exists()) {
          setStore(null);
          setMenu([]);
          setIsLoading(false);
          return;
        }

        const s = storeSnap.data();
        setStore({
          id: storeSnap.id,
          name: s.name ?? 'Unnamed',
          cuisine: s.cuisine ?? '',
          description: s.description ?? '',
          rating: typeof s.rating === 'number' ? s.rating : 0,
          reviewCount: typeof s.reviewCount === 'number' ? s.reviewCount : 0,
          deliveryTime: s.deliveryTime ?? '—',
          deliveryFee: typeof s.deliveryFee === 'number' ? s.deliveryFee : 0,
          minOrderAmount: typeof s.minOrderAmount === 'number' ? s.minOrderAmount : 0,
          isOpen: s.isOpen !== false,
          image: s.image ?? '🍽️',
          address: s.address ?? '',
          city: s.city ?? '',
        });

        const items: MenuItem[] = productsSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            storeId: data.storeId,
            name: data.name ?? 'Unnamed',
            description: data.description ?? '',
            price: typeof data.price === 'number' ? data.price : 0,
            category: data.category ?? 'Other',
            available: data.available !== false,
            isVegetarian: data.isVegetarian === true,
            isSpicy: data.isSpicy === true,
            preparationTime: typeof data.preparationTime === 'number' ? data.preparationTime : 20,
            image: data.image ?? '🍽️',
          };
        });
        setMenu(items);
        setIsLoading(false);
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
  }, [id]);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(menu.map((item) => item.category)))],
    [menu],
  );

  const filteredItems = useMemo(
    () => (selectedCategory === 'All' ? menu : menu.filter((item) => item.category === selectedCategory)),
    [menu, selectedCategory],
  );

  const handleAddToCart = (itemId: string) => {
    const item = menu.find((i) => i.id === itemId);
    if (!item) return;
    const quantity = quantities[itemId] || 1;

    const product: Product = {
      id: item.id,
      storeId: item.storeId,
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      available: item.available,
      isVegetarian: item.isVegetarian,
      isSpicy: item.isSpicy,
      preparationTime: item.preparationTime,
    };

    addToCart(product, quantity);
    setQuantities((prev) => ({ ...prev, [itemId]: 0 }));
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setQuantities((prev) => ({
      ...prev,
      [itemId]: Math.max(0, (prev[itemId] || 0) + delta),
    }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-br from-primary to-primary-dark text-white">
          <div className="container mx-auto px-4 py-6">
            <div className="h-6 w-40 bg-white/20 rounded mb-4 animate-pulse" />
            <div className="h-10 w-2/3 bg-white/20 rounded mb-3 animate-pulse" />
            <div className="h-4 w-1/2 bg-white/20 rounded animate-pulse" />
          </div>
        </div>
        <div className="container mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-md p-4 flex gap-4 animate-pulse">
              <div className="w-24 h-24 bg-gray-200 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-5 bg-gray-200 rounded w-2/3" />
                <div className="h-4 bg-gray-200 rounded w-full" />
                <div className="h-4 bg-gray-200 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-red-600 font-semibold mb-2">Could not load restaurant</p>
          <p className="text-gray-500 text-sm font-mono break-all mb-4">{errorMessage}</p>
          <Link href="/restaurants" className="text-primary underline">
            Back to restaurants
          </Link>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-gray-700 text-lg font-semibold mb-2">Restaurant not found</p>
          <p className="text-gray-500 mb-4">No store exists with id <span className="font-mono">{id}</span>.</p>
          <Link href="/restaurants" className="text-primary underline">
            Back to restaurants
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Restaurant Header */}
      <div className="bg-gradient-to-br from-primary to-primary-dark text-white">
        <div className="container mx-auto px-4 py-6">
          <Link href="/restaurants" className="inline-flex items-center gap-2 text-white/80 hover:text-white mb-4">
            <ArrowLeft className="w-5 h-5" />
            Back to Restaurants
          </Link>

          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-bold mb-2">{store.name}</h1>
              <p className="text-white/90 mb-4">{store.cuisine}</p>
              {store.description && <p className="text-white/80 mb-4">{store.description}</p>}

              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-semibold">{store.rating}</span>
                  <span className="text-white/80">({store.reviewCount} reviews)</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{store.deliveryTime}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Motorbike className="w-4 h-4" />
                  <span>R{store.deliveryFee} delivery</span>
                </div>
              </div>
            </div>

            <div className="text-8xl">{store.image}</div>
          </div>
        </div>
      </div>

      {/* Menu Section */}
      <div className="container mx-auto px-4 py-8">
        {menu.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-700 text-lg font-semibold mb-2">No menu items yet</p>
            <p className="text-gray-500">This restaurant hasn't added any products.</p>
          </div>
        ) : (
          <>
            {/* Category Filter */}
            <div className="flex gap-2 overflow-x-auto pb-4 mb-6">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                    selectedCategory === category
                      ? 'bg-primary text-white'
                      : 'bg-white hover:bg-gray-100'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            {/* Menu Items */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredItems.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`bg-white rounded-xl shadow-md overflow-hidden ${!item.available ? 'opacity-50' : ''}`}
                >
                  <div className="flex gap-4 p-4">
                    <div className="w-24 h-24 bg-gradient-to-br from-primary-light to-primary rounded-lg flex items-center justify-center text-4xl flex-shrink-0">
                      {item.image}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-lg">{item.name}</h3>
                        <button className="text-gray-400 hover:text-red-500">
                          <Heart className="w-5 h-5" />
                        </button>
                      </div>

                      <p className="text-gray-600 text-sm mb-2">{item.description}</p>

                      <div className="flex flex-wrap gap-2 mb-2">
                        {item.isVegetarian && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Vegetarian</span>
                        )}
                        {item.isSpicy && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">Spicy</span>
                        )}
                        {!item.available && (
                          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">Unavailable</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="font-bold text-lg">R{item.price}</span>

                        {item.available ? (
                          <div className="flex items-center gap-2">
                            {quantities[item.id] && quantities[item.id] > 0 ? (
                              <>
                                <button
                                  onClick={() => updateQuantity(item.id, -1)}
                                  className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="font-semibold w-6 text-center">{quantities[item.id]}</span>
                                <button
                                  onClick={() => updateQuantity(item.id, 1)}
                                  className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center hover:bg-primary-dark"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleAddToCart(item.id)}
                                  className="ml-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-semibold"
                                >
                                  Add
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => updateQuantity(item.id, 1)}
                                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-semibold"
                              >
                                Add to Cart
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-500 text-sm">Sold out</span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
