'use client';

// Checkout Page
// Handles order placement and payment

import { useState } from 'react';
import { useCart } from '../../context/CartContext';
import { CreditCard, Smartphone, DollarSign, MapPin, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { processPayment, getPaymentMethodInfo } from '../../services/paymentService';
import { useRouter } from 'next/navigation';

export default function CheckoutPage() {
  const { cart, clearCart } = useCart();
  const router = useRouter();
  const [selectedPayment, setSelectedPayment] = useState<'cash' | 'yoco' | 'ozow'>('cash');
  const [isProcessing, setIsProcessing] = useState(false);

  const [formData, setFormData] = useState({
    street: '',
    city: '',
    postalCode: '',
    instructions: '',
    phone: '',
    email: '',
    promoCode: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    try {
      // Generate order ID
      const orderId = `ORD-${Date.now()}`;

      // Process payment
      const paymentResponse = await processPayment({
        amount: cart.total,
        paymentMethod: selectedPayment,
        orderId,
        customerEmail: formData.email,
        customerPhone: formData.phone,
        description: `Order for ${cart.items.length} items`,
      });

      if (!paymentResponse.success) {
        toast.error(paymentResponse.error || 'Payment failed');
        setIsProcessing(false);
        return;
      }

      // Payment successful
      toast.success('Order placed successfully! 🎉');
      clearCart();

      // Redirect to order tracking
      router.push(`/orders/${orderId}`);
    } catch (error) {
      toast.error('An error occurred. Please try again.');
      console.error('Payment error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  if (cart.items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Your cart is empty</h2>
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
        <h1 className="text-3xl font-bold mb-6">Checkout</h1>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Checkout Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Delivery Address */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl shadow-md p-6"
            >
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                Delivery Address
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Street Address</label>
                  <input
                    type="text"
                    name="street"
                    value={formData.street}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="123 Main Street"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2">City</label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Soweto"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2">Postal Code</label>
                    <input
                      type="text"
                      name="postalCode"
                      value={formData.postalCode}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="1800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Delivery Instructions (Optional)</label>
                  <textarea
                    name="instructions"
                    value={formData.instructions}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Gate code, landmarks, etc."
                    rows={2}
                  />
                </div>
              </div>
            </motion.div>

            {/* Contact Information */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-xl shadow-md p-6"
            >
              <h2 className="text-xl font-bold mb-4">Contact Information</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Phone Number</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="+27 83 123 4567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="you@example.com"
                  />
                </div>
              </div>
            </motion.div>

            {/* Payment Method */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-xl shadow-md p-6"
            >
              <h2 className="text-xl font-bold mb-4">Payment Method</h2>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setSelectedPayment('cash')}
                  className={`w-full p-4 rounded-lg border-2 flex items-center gap-4 transition-colors ${
                    selectedPayment === 'cash'
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <DollarSign className="w-6 h-6 text-green-600" />
                  <div className="text-left">
                    <p className="font-semibold">Cash on Delivery</p>
                    <p className="text-sm text-gray-600">Pay when your order arrives</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPayment('yoco')}
                  className={`w-full p-4 rounded-lg border-2 flex items-center gap-4 transition-colors ${
                    selectedPayment === 'yoco'
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <CreditCard className="w-6 h-6 text-blue-600" />
                  <div className="text-left">
                    <p className="font-semibold">Yoco</p>
                    <p className="text-sm text-gray-600">Card payment via Yoco</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPayment('ozow')}
                  className={`w-full p-4 rounded-lg border-2 flex items-center gap-4 transition-colors ${
                    selectedPayment === 'ozow'
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Smartphone className="w-6 h-6 text-purple-600" />
                  <div className="text-left">
                    <p className="font-semibold">Ozow</p>
                    <p className="text-sm text-gray-600">Instant EFT payment</p>
                  </div>
                </button>
              </div>
            </motion.div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-xl shadow-md p-6 sticky top-24"
            >
              <h2 className="text-xl font-bold mb-4">Order Summary</h2>

              {/* Order Items */}
              <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                {cart.items.map((item) => (
                  <div key={item.product.id} className="flex justify-between text-sm">
                    <span>{item.quantity}x {item.product.name}</span>
                    <span>R{(item.product.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Promo Code */}
              <div className="mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    name="promoCode"
                    value={formData.promoCode}
                    onChange={handleInputChange}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    placeholder="Promo code"
                  />
                  <button
                    type="button"
                    className="px-4 py-2 bg-gray-200 rounded-lg font-semibold text-sm hover:bg-gray-300"
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* Totals */}
              <div className="border-t border-gray-200 pt-4 space-y-2">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>R{cart.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Delivery Fee</span>
                  <span>R{cart.deliveryFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Discount</span>
                  <span className="text-green-600">-R0.00</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-xl">
                  <span>Total</span>
                  <span className="text-primary">R{cart.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Estimated Delivery */}
              <div className="mt-4 p-3 bg-primary/10 rounded-lg flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Estimated delivery: 25-35 min</span>
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
              >
                {isProcessing ? 'Processing...' : `Pay R${cart.total.toFixed(2)}`}
              </button>

              <Link
                href="/cart"
                className="block w-full text-center mt-3 text-gray-600 hover:text-primary font-semibold"
              >
                Back to Cart
              </Link>
            </motion.div>
          </div>
        </form>
      </div>
    </div>
  );
}
