// Header component for LokshinEats
// This appears at the top of every page

'use client';

import { useState } from 'react';
import { Search, ShoppingCart, User, Menu, X } from 'lucide-react';
import { useCart } from '../context/CartContext';
import Link from 'next/link';
import Notifications from '../components/Notifications';

export default function Header() {
  const { cartItemCount } = useCart();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white shadow-md">
      {/* Top bar with logo and actions */}
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Mobile menu button */}
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
          >
            <Menu className="w-6 h-6 text-gray-700" />
          </button>

          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-xl">L</span>
            </div>
            <h1 className="text-2xl font-bold text-black hidden sm:block">
              Lokshin<span className="text-primary">Eats</span>
            </h1>
          </Link>

          {/* Search bar - hidden on mobile */}
          <div className="hidden md:flex flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search restaurants, food..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Notifications */}
            <Notifications />

            {/* Cart button */}
            <Link href="/cart" className="relative p-2 hover:bg-gray-100 rounded-full">
              <ShoppingCart className="w-6 h-6 text-gray-700" />
              {cartItemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                  {cartItemCount}
                </span>
              )}
            </Link>

            {/* User button */}
            <Link href="/profile" className="p-2 hover:bg-gray-100 rounded-full">
              <User className="w-6 h-6 text-gray-700" />
            </Link>
          </div>
        </div>

        {/* Mobile search bar */}
        <div className="mt-3 md:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search restaurants, food..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-50">
          <div className="bg-white h-full w-64 p-6">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold">Menu</h2>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-6 h-6 text-gray-700" />
              </button>
            </div>
            
            <nav className="space-y-4">
              <Link
                href="/restaurants"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block py-3 text-gray-700 hover:text-primary font-semibold"
              >
                Restaurants
              </Link>
              <Link
                href="/orders"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block py-3 text-gray-700 hover:text-primary font-semibold"
              >
                My Orders
              </Link>
              <Link
                href="/favorites"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block py-3 text-gray-700 hover:text-primary font-semibold"
              >
                Favorites
              </Link>
              <Link
                href="/profile"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block py-3 text-gray-700 hover:text-primary font-semibold"
              >
                Profile
              </Link>
              <Link
                href="/vendor/dashboard"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block py-3 text-gray-700 hover:text-primary font-semibold"
              >
                Store Owner
              </Link>
              <Link
                href="/driver/dashboard"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block py-3 text-gray-700 hover:text-primary font-semibold"
              >
                Driver
              </Link>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
