// Bottom Navigation component for LokshinEats
// This appears at the bottom of the screen on mobile devices

'use client';

import { useState, useEffect } from 'react';
import { Home, Search, Heart, User, ShoppingBag, Package } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { auth, db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function BottomNav() {
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<'customer' | 'vendor' | 'driver' | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUserRole(userData.role);
          }
        } catch (error) {
          console.error('Error fetching user role:', error);
        }
      } else {
        setUserRole(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const isActive = (path: string) => pathname === path;

  // Driver navigation: Home, Deliveries, Profile
  if (userRole === 'driver') {
    return (
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 lg:hidden z-50">
        <div className="flex justify-around items-center py-3">
          <Link href="/driver/dashboard" className="flex flex-col items-center space-y-1">
            <Home className={`w-6 h-6 ${isActive('/driver/dashboard') ? 'text-primary' : 'text-gray-500'}`} />
            <span className={`text-xs font-medium ${isActive('/driver/dashboard') ? 'text-primary' : 'text-gray-500'}`}>Home</span>
          </Link>

          <Link href="/driver/orders" className="flex flex-col items-center space-y-1">
            <Package className={`w-6 h-6 ${isActive('/driver/orders') ? 'text-primary' : 'text-gray-500'}`} />
            <span className={`text-xs font-medium ${isActive('/driver/orders') ? 'text-primary' : 'text-gray-500'}`}>Deliveries</span>
          </Link>

          <Link href="/profile" className="flex flex-col items-center space-y-1">
            <User className={`w-6 h-6 ${isActive('/profile') ? 'text-primary' : 'text-gray-500'}`} />
            <span className={`text-xs font-medium ${isActive('/profile') ? 'text-primary' : 'text-gray-500'}`}>Profile</span>
          </Link>
        </div>
      </nav>
    );
  }

  // Vendor navigation: Home, Orders, Profile
  if (userRole === 'vendor') {
    return (
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 lg:hidden z-50">
        <div className="flex justify-around items-center py-3">
          <Link href="/vendor/dashboard" className="flex flex-col items-center space-y-1">
            <Home className={`w-6 h-6 ${isActive('/vendor/dashboard') ? 'text-primary' : 'text-gray-500'}`} />
            <span className={`text-xs font-medium ${isActive('/vendor/dashboard') ? 'text-primary' : 'text-gray-500'}`}>Home</span>
          </Link>

          <Link href="/vendor/orders" className="flex flex-col items-center space-y-1">
            <ShoppingBag className={`w-6 h-6 ${isActive('/vendor/orders') ? 'text-primary' : 'text-gray-500'}`} />
            <span className={`text-xs font-medium ${isActive('/vendor/orders') ? 'text-primary' : 'text-gray-500'}`}>Orders</span>
          </Link>

          <Link href="/profile" className="flex flex-col items-center space-y-1">
            <User className={`w-6 h-6 ${isActive('/profile') ? 'text-primary' : 'text-gray-500'}`} />
            <span className={`text-xs font-medium ${isActive('/profile') ? 'text-primary' : 'text-gray-500'}`}>Profile</span>
          </Link>
        </div>
      </nav>
    );
  }

  // Customer navigation (default): Home, Search, Orders, Favorites, Profile
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 lg:hidden z-50">
      <div className="flex justify-around items-center py-3">
        {/* Home button */}
        <Link href="/" className="flex flex-col items-center space-y-1">
          <Home className={`w-6 h-6 ${isActive('/') ? 'text-primary' : 'text-gray-500'}`} />
          <span className={`text-xs font-medium ${isActive('/') ? 'text-primary' : 'text-gray-500'}`}>Home</span>
        </Link>

        {/* Search button */}
        <Link href="/restaurants" className="flex flex-col items-center space-y-1">
          <Search className={`w-6 h-6 ${isActive('/restaurants') ? 'text-primary' : 'text-gray-500'}`} />
          <span className={`text-xs font-medium ${isActive('/restaurants') ? 'text-primary' : 'text-gray-500'}`}>Search</span>
        </Link>

        {/* Orders button */}
        <Link href="/orders" className="flex flex-col items-center space-y-1">
          <ShoppingBag className={`w-6 h-6 ${isActive('/orders') ? 'text-primary' : 'text-gray-500'}`} />
          <span className={`text-xs font-medium ${isActive('/orders') ? 'text-primary' : 'text-gray-500'}`}>Orders</span>
        </Link>

        {/* Favorites button */}
        <Link href="/favorites" className="flex flex-col items-center space-y-1">
          <Heart className={`w-6 h-6 ${isActive('/favorites') ? 'text-primary' : 'text-gray-500'}`} />
          <span className={`text-xs font-medium ${isActive('/favorites') ? 'text-primary' : 'text-gray-500'}`}>Favorites</span>
        </Link>

        {/* Profile button */}
        <Link href="/profile" className="flex flex-col items-center space-y-1">
          <User className={`w-6 h-6 ${isActive('/profile') ? 'text-primary' : 'text-gray-500'}`} />
          <span className={`text-xs font-medium ${isActive('/profile') ? 'text-primary' : 'text-gray-500'}`}>Profile</span>
        </Link>
      </div>
    </nav>
  );
}
