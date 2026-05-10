'use client';

// Product Management Page
// Allows store owners to manage their menu items

import { useState } from 'react';
import { Plus, Edit, Trash2, Search, Filter, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

// Mock products (will be replaced with Firebase)
const mockProducts = [
  {
    id: '1',
    name: 'Pap & Vleis Combo',
    description: 'Traditional pap with grilled beef, onion rings, and chakalaka',
    price: 65,
    category: 'Main',
    available: true,
    isVegetarian: false,
    isSpicy: true,
    image: '🍲',
  },
  {
    id: '2',
    name: 'Chicken Kota',
    description: 'Quarter chicken with polony, cheese, chips, and egg',
    price: 45,
    category: 'Kota',
    available: true,
    isVegetarian: false,
    isSpicy: false,
    image: '🍔',
  },
  {
    id: '3',
    name: 'Braai Platter',
    description: 'Mixed grill with boerewors, lamb chops, and chicken wings',
    price: 120,
    category: 'Braai',
    available: true,
    isVegetarian: false,
    isSpicy: false,
    image: '🍖',
  },
  {
    id: '4',
    name: 'Vegetable Stew',
    description: 'Mixed vegetables in mild curry sauce with pap',
    price: 40,
    category: 'Vegetarian',
    available: false,
    isVegetarian: true,
    isSpicy: false,
    image: '🥗',
  },
  {
    id: '5',
    name: 'Soft Drink',
    description: '330ml cold drink',
    price: 15,
    category: 'Drinks',
    available: true,
    isVegetarian: true,
    isSpicy: false,
    image: '🥤',
  },
];

const categories = ['All', ...new Set(mockProducts.map(p => p.category))];

export default function ProductsPage() {
  const [products, setProducts] = useState(mockProducts);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showUnavailable, setShowUnavailable] = useState(true);

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
    const matchesAvailability = showUnavailable || product.available;
    return matchesSearch && matchesCategory && matchesAvailability;
  });

  const toggleAvailability = (productId: string) => {
    setProducts(prev => prev.map(p => 
      p.id === productId ? { ...p, available: !p.available } : p
    ));
    toast.success('Product availability updated');
  };

  const deleteProduct = (productId: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      setProducts(prev => prev.filter(p => p.id !== productId));
      toast.success('Product deleted');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/vendor/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-2">
              <ArrowLeft className="w-5 h-5" />
              Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold">Products</h1>
          </div>

          <Link
            href="/vendor/products/new"
            className="bg-primary text-white px-4 py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Product
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-md p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showUnavailable}
                onChange={(e) => setShowUnavailable(e.target.checked)}
                className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
              />
              <span className="text-sm">Show unavailable</span>
            </label>
          </div>
        </div>

        {/* Products List */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          {filteredProducts.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500">No products found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredProducts.map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-primary-light to-primary rounded-lg flex items-center justify-center text-3xl flex-shrink-0">
                      {product.image}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-semibold text-lg">{product.name}</h3>
                        <span className="font-bold text-lg text-primary">R{product.price}</span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{product.description}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">{product.category}</span>
                        {product.isVegetarian && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Vegetarian</span>
                        )}
                        {product.isSpicy && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">Spicy</span>
                        )}
                        {!product.available && (
                          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full">Unavailable</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleAvailability(product.id)}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          product.available
                            ? 'bg-red-100 text-red-600 hover:bg-red-200'
                            : 'bg-green-100 text-green-600 hover:bg-green-200'
                        }`}
                      >
                        {product.available ? 'Unavailable' : 'Available'}
                      </button>

                      <Link
                        href={`/vendor/products/${product.id}/edit`}
                        className="p-2 text-gray-600 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Edit className="w-5 h-5" />
                      </Link>

                      <button
                        onClick={() => deleteProduct(product.id)}
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white rounded-xl shadow-md p-4 text-center">
            <p className="text-2xl font-bold">{products.length}</p>
            <p className="text-sm text-gray-600">Total Products</p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{products.filter(p => p.available).length}</p>
            <p className="text-sm text-gray-600">Available</p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-4 text-center">
            <p className="text-2xl font-bold text-gray-400">{products.filter(p => !p.available).length}</p>
            <p className="text-sm text-gray-600">Unavailable</p>
          </div>
        </div>
      </div>
    </div>
  );
}
