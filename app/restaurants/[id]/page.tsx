'use client';

// Restaurant Detail Page
// Shows restaurant info and menu

import { useState } from 'react';
import { Star, Clock, Motorbike, Heart, Plus, Minus, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useCart } from '../../../context/CartContext';
import toast from 'react-hot-toast';

// Mock restaurant data (will be replaced with Firebase)
const mockRestaurant = {
  id: '1',
  name: "Mama's Kitchen",
  cuisine: "Traditional Township Food",
  description: "Authentic township flavors passed down through generations. Our recipes bring the warmth of home cooking to your doorstep.",
  rating: 4.8,
  reviewCount: 234,
  deliveryTime: "25-35 min",
  deliveryFee: 15,
  minOrderAmount: 50,
  isOpen: true,
  image: '🍲',
  address: '123 Main Street, Soweto',
  city: 'Johannesburg',
};

// Mock menu items (will be replaced with Firebase)
const mockMenuItems = [
  {
    id: '1',
    name: 'Pap & Vleis Combo',
    description: 'Traditional pap with grilled beef, onion rings, and chakalaka',
    price: 65,
    category: 'Main',
    available: true,
    image: '🍲',
    isVegetarian: false,
    isSpicy: true,
  },
  {
    id: '2',
    name: 'Chicken Kota',
    description: 'Quarter chicken with polony, cheese, chips, and egg',
    price: 45,
    category: 'Kota',
    available: true,
    image: '🍔',
    isVegetarian: false,
    isSpicy: false,
  },
  {
    id: '3',
    name: 'Braai Platter',
    description: 'Mixed grill with boerewors, lamb chops, and chicken wings',
    price: 120,
    category: 'Braai',
    available: true,
    image: '🍖',
    isVegetarian: false,
    isSpicy: false,
  },
  {
    id: '4',
    name: 'Mogodu',
    description: 'Traditional tripe stew with pap',
    price: 55,
    category: 'Traditional',
    available: true,
    image: '🥘',
    isVegetarian: false,
    isSpicy: true,
  },
  {
    id: '5',
    name: 'Vegetable Stew',
    description: 'Mixed vegetables in mild curry sauce with pap',
    price: 40,
    category: 'Vegetarian',
    available: true,
    image: '🥗',
    isVegetarian: true,
    isSpicy: false,
  },
  {
    id: '6',
    name: 'Chips & Russian',
    description: 'Crispy chips with russian sausage and sauce',
    price: 35,
    category: 'Sides',
    available: true,
    image: '🍟',
    isVegetarian: false,
    isSpicy: false,
  },
  {
    id: '7',
    name: 'Samp & Beans',
    description: 'Traditional samp with beans and gravy',
    price: 45,
    category: 'Traditional',
    available: false,
    image: '🥘',
    isVegetarian: true,
    isSpicy: false,
  },
  {
    id: '8',
    name: 'Soft Drink',
    description: '330ml cold drink',
    price: 15,
    category: 'Drinks',
    available: true,
    image: '🥤',
    isVegetarian: true,
    isSpicy: false,
  },
];

const categories = ['All', ...new Set(mockMenuItems.map(item => item.category))];

export default function RestaurantDetailPage({ params }: { params: { id: string } }) {
  const { addToCart } = useCart();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const filteredItems = selectedCategory === 'All' 
    ? mockMenuItems 
    : mockMenuItems.filter(item => item.category === selectedCategory);

  const handleAddToCart = (itemId: string) => {
    const item = mockMenuItems.find(i => i.id === itemId);
    if (!item) return;

    const quantity = quantities[itemId] || 1;
    
    // Convert mock item to Product type
    const product = {
      id: item.id,
      storeId: mockRestaurant.id,
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      available: item.available,
      isVegetarian: item.isVegetarian,
      isSpicy: item.isSpicy,
      preparationTime: 20,
    };

    for (let i = 0; i < quantity; i++) {
      addToCart(product, 1);
    }

    setQuantities(prev => ({ ...prev, [itemId]: 0 }));
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setQuantities(prev => ({
      ...prev,
      [itemId]: Math.max(0, (prev[itemId] || 0) + delta)
    }));
  };

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
              <h1 className="text-3xl md:text-4xl font-bold mb-2">{mockRestaurant.name}</h1>
              <p className="text-white/90 mb-4">{mockRestaurant.cuisine}</p>
              <p className="text-white/80 mb-4">{mockRestaurant.description}</p>
              
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-semibold">{mockRestaurant.rating}</span>
                  <span className="text-white/80">({mockRestaurant.reviewCount} reviews)</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{mockRestaurant.deliveryTime}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Motorbike className="w-4 h-4" />
                  <span>R{mockRestaurant.deliveryFee} delivery</span>
                </div>
              </div>
            </div>
            
            <div className="text-8xl">{mockRestaurant.image}</div>
          </div>
        </div>
      </div>

      {/* Menu Section */}
      <div className="container mx-auto px-4 py-8">
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
              className={`bg-white rounded-xl shadow-md overflow-hidden ${
                !item.available ? 'opacity-50' : ''
              }`}
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
      </div>
    </div>
  );
}
