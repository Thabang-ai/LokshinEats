'use client';

// Cart Context - manages shopping cart state across the app
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Cart, CartItem, Product } from '../types';
import toast from 'react-hot-toast';

interface CartContextType {
  cart: Cart;
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

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('kLokshinEats-cart');
    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('kLokshinEats-cart', JSON.stringify(cart));
  }, [cart]);

  // Calculate totals whenever cart items change
  useEffect(() => {
    const subtotal = cart.items.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0
    );
    const deliveryFee = cart.items.length > 0 ? 15 : 0; // Fixed delivery fee for now
    const total = subtotal + deliveryFee;

    setCart((prev) => ({
      ...prev,
      subtotal,
      deliveryFee,
      total,
    }));
  }, [cart.items]);

  const addToCart = (product: Product, quantity: number = 1) => {
    setCart((prev) => {
      // Check if adding from different store
      if (prev.storeId && prev.storeId !== product.storeId) {
        toast.error('You can only order from one restaurant at a time');
        return prev;
      }

      const existingItem = prev.items.find(
        (item) => item.product.id === product.id
      );

      if (existingItem) {
        return {
          ...prev,
          storeId: product.storeId,
          items: prev.items.map((item) =>
            item.product.id === product.id
              ? { ...item, quantity: item.quantity + quantity }
              : item
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
      storeId:
        prev.items.length === 1
          ? undefined
          : prev.storeId,
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
        item.product.id === productId ? { ...item, quantity } : item
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
  };

  const cartItemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        cart,
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
