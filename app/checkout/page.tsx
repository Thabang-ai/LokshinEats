'use client';

// Checkout Page
// Writes a real order document to Firestore on submit.
// Payment processing still goes through paymentService (Yoco/Ozow stubs +
// real-ish cash flow) — real gateway integration is Phase 4.

import { useEffect, useState } from 'react';
import { useCart } from '../../context/CartContext';
import { CreditCard, Smartphone, DollarSign, MapPin, Clock, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { processPayment } from '../../services/paymentService';
import { useRouter } from 'next/navigation';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuthUser } from '../../hooks/useAuthUser';
import { computeOrderEconomics } from '../../services/economics';

export default function CheckoutPage() {
  const { cart, storeMeta, clearCart } = useCart();
  const router = useRouter();
  const { user, authReady } = useAuthUser();
  const [selectedPayment, setSelectedPayment] = useState<'cash' | 'yoco' | 'ozow'>('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  // For cash payments — customer can declare which note they'll pay with so
  // the driver knows whether to bring change. Defaults to exact total.
  const [cashAmount, setCashAmount] = useState<number | ''>('');

  const [formData, setFormData] = useState({
    street: '',
    city: '',
    postalCode: '',
    instructions: '',
    phone: '',
    email: '',
  });

  // Pre-fill email from authenticated user once auth resolves
  useEffect(() => {
    if (user?.email && !formData.email) {
      setFormData((prev) => ({ ...prev, email: user.email ?? '' }));
    }
  }, [user]);

  // Redirect to login if not authenticated. Firestore rules require
  // request.auth.uid == request.resource.data.customerId on order create.
  useEffect(() => {
    if (authReady && !user) {
      toast.error('Please log in to checkout');
      router.push('/auth/login');
    }
  }, [authReady, user, router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error('Please log in to checkout');
      router.push('/auth/login');
      return;
    }
    if (!storeMeta) {
      toast.error('Cart is missing restaurant info — try refreshing');
      return;
    }
    if (!storeMeta.isOpen) {
      toast.error(`${storeMeta.name} is currently closed`);
      return;
    }
    if (cart.subtotal < storeMeta.minOrderAmount) {
      toast.error(`Minimum order is R${storeMeta.minOrderAmount}`);
      return;
    }

    // Cash amount validation — must be at least the order total if set
    const cashAmountEffective =
      selectedPayment === 'cash'
        ? typeof cashAmount === 'number' && cashAmount > 0
          ? cashAmount
          : cart.total
        : null;
    if (cashAmountEffective !== null && cashAmountEffective < cart.total) {
      toast.error(`Cash amount must be at least R${cart.total.toFixed(2)}`);
      return;
    }

    setIsProcessing(true);

    try {
      // Step 1: Process payment (stubbed — Phase 4 will plug in real gateways)
      // We pass a temporary id; the real Firestore doc ID is generated below.
      const paymentResponse = await processPayment({
        amount: cart.total,
        paymentMethod: selectedPayment,
        orderId: `pending-${Date.now()}`,
        customerEmail: formData.email,
        customerPhone: formData.phone,
        description: `Order for ${cart.items.length} items`,
      });

      if (!paymentResponse.success) {
        toast.error(paymentResponse.error || 'Payment failed');
        setIsProcessing(false);
        return;
      }

      // Compute platform economics at write time. These get frozen on the
      // order so historical numbers don't shift if rates change later.
      const economics = computeOrderEconomics(cart.subtotal, cart.deliveryFee);

      // 4-digit OTP that the customer reads to the driver at handoff.
      // Driver enters it in their app to mark delivery + payment received.
      // KNOWN LIMITATION: drivers technically have read access to assigned
      // orders, so a determined driver could read this from Firestore via
      // dev tools and bypass the verification. Proper fix is server-side
      // verification via Cloud Functions (Blaze plan). For now this is a
      // good-fences/casual-fraud deterrent.
      const deliveryOTP = String(Math.floor(1000 + Math.random() * 9000));

      // Step 2: Write real order to Firestore.
      // Fields are denormalized so other roles (vendor, driver) can render
      // them without reading users/{customerId} (rules block cross-user reads).
      const docRef = await addDoc(collection(db, 'orders'), {
        customerId: user.uid,
        customerName: user.displayName ?? user.email ?? 'Customer',
        customerEmail: formData.email,
        customerPhone: formData.phone,
        storeId: storeMeta.id,
        storeName: storeMeta.name,
        driverId: null, // explicit null so `where driverId == null` matches
        items: cart.items,
        status: 'pending' as const,
        subtotal: cart.subtotal,
        deliveryFee: cart.deliveryFee,
        total: cart.total,
        paymentMethod: selectedPayment,
        paymentStatus: selectedPayment === 'cash' ? ('pending' as const) : ('paid' as const),
        paymentTransactionId: paymentResponse.transactionId ?? null,
        deliveryAddress: {
          street: formData.street,
          city: formData.city,
          postalCode: formData.postalCode,
          instructions: formData.instructions || null,
        },
        deliveryOTP,
        deliveryOTPVerified: false,
        // Cash logistics — null for card/Ozow, customer's declared note for cash
        cashAmount: cashAmountEffective,
        // Platform economics — frozen at the rate this order was placed
        vendorPayout: economics.vendorPayout,
        driverPayout: economics.driverPayout,
        platformEarnings: economics.platformEarnings,
        platformCommission: economics.platformCommission,
        commissionRate: economics.commissionRate,
        driverDeliveryShare: economics.driverDeliveryShare,
        createdAt: serverTimestamp(),
      });

      toast.success('Order placed successfully! 🎉');
      clearCart();
      router.push(`/orders/${docRef.id}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'An error occurred. Please try again.';
      toast.error(msg);
      console.error('Checkout error:', error);
      setIsProcessing(false);
    }
  };

  // ---- Render branches ----------------------------------------------------

  if (!authReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

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

  const storeClosed = storeMeta ? !storeMeta.isOpen : false;
  const belowMin = storeMeta ? cart.subtotal < storeMeta.minOrderAmount : false;
  const canSubmit = !!storeMeta && !storeClosed && !belowMin && !isProcessing;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-2">Checkout</h1>
        {storeMeta && (
          <p className="text-sm text-gray-500 mb-6">From {storeMeta.name}</p>
        )}

        {storeClosed && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800">{storeMeta?.name} is currently closed</p>
              <p className="text-sm text-red-700">
                You can't place this order right now. Come back when they're open.
              </p>
            </div>
          </div>
        )}

        {belowMin && !storeClosed && storeMeta && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800">
                Add R{(storeMeta.minOrderAmount - cart.subtotal).toFixed(2)} more to checkout
              </p>
              <p className="text-sm text-amber-700">
                Minimum order at {storeMeta.name} is R{storeMeta.minOrderAmount}.
              </p>
            </div>
          </div>
        )}

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
                  <p className="text-xs text-gray-500 mt-1">
                    Your driver may call you with delivery questions.
                  </p>
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

            {/* Cash details — only when cash is selected. Helps driver plan change. */}
            {selectedPayment === 'cash' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="bg-white rounded-xl shadow-md p-6"
              >
                <h2 className="text-xl font-bold mb-2">Cash payment</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Your driver will collect{' '}
                  <span className="font-bold text-gray-900">R{cart.total.toFixed(2)}</span> when
                  they arrive.
                </p>
                <label htmlFor="cash-amount" className="block text-sm font-semibold mb-2">
                  Paying with a different note?
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-semibold">R</span>
                  <input
                    id="cash-amount"
                    type="number"
                    min={cart.total}
                    step="1"
                    inputMode="numeric"
                    value={cashAmount}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCashAmount(v === '' ? '' : Math.max(0, parseFloat(v) || 0));
                    }}
                    placeholder={`${cart.total.toFixed(0)} (exact)`}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <p className="text-sm mt-2">
                  {typeof cashAmount !== 'number' || cashAmount === 0 ? (
                    <span className="text-gray-500">
                      Default: have exact <strong>R{cart.total.toFixed(2)}</strong> ready.
                    </span>
                  ) : cashAmount < cart.total ? (
                    <span className="text-red-600 font-semibold">
                      Must be at least R{cart.total.toFixed(2)}
                    </span>
                  ) : cashAmount === cart.total ? (
                    <span className="text-green-700">No change needed — exact payment.</span>
                  ) : (
                    <span className="text-green-700">
                      Driver will bring{' '}
                      <strong>R{(cashAmount - cart.total).toFixed(2)}</strong> change.
                    </span>
                  )}
                </p>
              </motion.div>
            )}
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
                disabled={!canSubmit}
                className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
              >
                {isProcessing
                  ? 'Placing order…'
                  : storeClosed
                  ? 'Restaurant closed'
                  : belowMin && storeMeta
                  ? `Add R${(storeMeta.minOrderAmount - cart.subtotal).toFixed(2)} more`
                  : `Place order · R${cart.total.toFixed(2)}`}
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
