'use client';

// Cart Page
// Shows items in the shopping cart and checkout options

import { useCart } from '../../context/CartContext';
import { Plus, Minus, Trash2, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

export default function CartPage() {
  const { cart, removeFromCart, updateQuantity, clearCart } = useCart();

  if (cart.items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ShoppingBag className="w-24 h-24 text-gray-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Your cart is empty</h2>
          <p className="text-gray-600 mb-6">Add some delicious food to get started</p>
          <Link
            href="/restaurants"
            className="inline-block bg-primary text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-dark transition-colors"
          >
            Browse Restaurants
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Your Cart</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {cart.items.map((item, index) => (
              <motion.div
                key={item.product.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl shadow-md p-4"
              >
                <div className="flex gap-4">
                  <div className="w-24 h-24 bg-gradient-to-br from-primary-light to-primary rounded-lg flex items-center justify-center text-4xl flex-shrink-0">
                    🍲
                  </div>

                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1">{item.product.name}</h3>
                    <p className="text-gray-600 text-sm mb-2">{item.product.description}</p>
                    <p className="font-bold text-primary">R{item.product.price}</p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="font-semibold w-8 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center hover:bg-primary-dark"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {item.specialInstructions && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-sm text-gray-600">
                      <span className="font-semibold">Note:</span> {item.specialInstructions}
                    </p>
                  </div>
                )}
              </motion.div>
            ))}

            <button
              onClick={clearCart}
              className="text-red-500 hover:text-red-600 font-semibold text-sm"
            >
              Clear Cart
            </button>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-md p-6 sticky top-24">
              <h2 className="text-xl font-bold mb-4">Order Summary</h2>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>R{cart.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Delivery Fee</span>
                  <span>R{cart.deliveryFee.toFixed(2)}</span>
                </div>
                <div className="border-t border-gray-200 pt-3 flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span className="text-primary">R{cart.total.toFixed(2)}</span>
                </div>
              </div>

              <Link
                href="/checkout"
                className="block w-full bg-primary text-white text-center py-3 rounded-xl font-semibold hover:bg-primary-dark transition-colors"
              >
                Proceed to Checkout
              </Link>

              <Link
                href="/restaurants"
                className="block w-full text-center mt-3 text-gray-600 hover:text-primary font-semibold"
              >
                Continue Shopping
              </Link>

              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">🎁 Promo Code:</span> Enter at checkout
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
