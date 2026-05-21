'use client';

// Cart Context - manages shopping cart state across the app.
// Fetches store metadata (deliveryFee, isOpen, minOrderAmount) whenever the
// cart's storeId changes, so cart + checkout always show the real values
// instead of a flat R15 placeholder.

import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Cart, CartItem, Product } from '../types';
import { db } from '../firebase/config';
import toast from 'react-hot-toast';

export type StoreMeta = {
  id: string;
  name: string;
  isOpen: boolean;
  deliveryFee: number;
  minOrderAmount: number;
};

interface CartContextType {
  cart: Cart;
  storeMeta: StoreMeta | null;
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  cartItemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart>({
    items: [],
    subtotal: 0,
    deliveryFee: 0,
    total: 0,
  });
  const [storeMeta, setStoreMeta] = useState<StoreMeta | null>(null);

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('lokshineats-cart');
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch {
        // ignore corrupt entries
      }
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('lokshineats-cart', JSON.stringify(cart));
  }, [cart]);

  // Fetch store metadata whenever the cart's storeId changes.
  // Stores are publicly readable per Firestore rules, so no auth needed.
  useEffect(() => {
    if (!cart.storeId) {
      setStoreMeta(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'stores', cart.storeId!));
        if (cancelled) return;
        if (!snap.exists()) {
          setStoreMeta(null);
          return;
        }
        const data = snap.data();
        setStoreMeta({
          id: snap.id,
          name: data.name ?? 'Unnamed',
          isOpen: data.isOpen !== false,
          deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 15,
          minOrderAmount: typeof data.minOrderAmount === 'number' ? data.minOrderAmount : 0,
        });
      } catch {
        if (!cancelled) setStoreMeta(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cart.storeId]);

  // Recalculate totals whenever cart items or store fee change.
  useEffect(() => {
    const subtotal = cart.items.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0,
    );
    // Use the real store delivery fee when we have it; fall back to 15 only
    // until the store fetch settles (and 0 for an empty cart).
    const deliveryFee =
      cart.items.length === 0 ? 0 : storeMeta?.deliveryFee ?? 15;
    const total = subtotal + deliveryFee;

    setCart((prev) => {
      if (
        prev.subtotal === subtotal &&
        prev.deliveryFee === deliveryFee &&
        prev.total === total
      ) {
        return prev;
      }
      return { ...prev, subtotal, deliveryFee, total };
    });
  }, [cart.items, storeMeta?.deliveryFee]);

  const addToCart = (product: Product, quantity: number = 1) => {
    setCart((prev) => {
      // Check if adding from different store
      if (prev.storeId && prev.storeId !== product.storeId) {
        toast.error('You can only order from one restaurant at a time');
        return prev;
      }

      const existingItem = prev.items.find(
        (item) => item.product.id === product.id,
      );

      if (existingItem) {
        return {
          ...prev,
          storeId: product.storeId,
          items: prev.items.map((item) =>
            item.product.id === product.id
              ? { ...item, quantity: item.quantity + quantity }
              : item,
          ),
        };
      }

      return {
        ...prev,
        storeId: product.storeId,
        items: [...prev.items, { product, quantity }],
      };
    });

    toast.success(`${product.name} added to cart`);
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.product.id !== productId),
      storeId: prev.items.length === 1 ? undefined : prev.storeId,
    }));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    setCart((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item,
      ),
    }));
  };

  const clearCart = () => {
    setCart({
      items: [],
      subtotal: 0,
      deliveryFee: 0,
      total: 0,
    });
    setStoreMeta(null);
  };

  const cartItemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        cart,
        storeMeta,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartItemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
