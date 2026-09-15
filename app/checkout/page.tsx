'use client';

// Checkout Page
//
// Submits the basket to POST /api/v1/orders and lets the server price it.
// This page used to compute the subtotal, delivery fee, total and all four
// payout figures in the browser, run a simulated payment that always
// succeeded, generate the delivery code with Math.random, and write the
// whole document to Firestore itself — so any client could mint a paid
// order at a price it chose. None of that happens here any more.

import { useEffect, useState } from 'react';
import { useCart } from '../../context/CartContext';
import { CreditCard, Smartphone, DollarSign, MapPin, Clock, AlertCircle, LocateFixed } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuthUser } from '../../hooks/useAuthUser';
import { ApiError } from '../../services/apiClient';
import { findNearestTownship, getCurrentLocation } from '../../services/mapService';
import {
  completeSandboxPayment,
  initiatePayment,
  isSandboxPayment,
  placeOrder,
  verifyPayment,
} from '../../services/ordersApi';

// Real South African banknote denominations, smallest to largest — customers
// pick from what they're actually holding rather than typing an arbitrary number.
const CASH_NOTE_DENOMINATIONS = [10, 20, 50, 100, 200];

export default function CheckoutPage() {
  const { cart, storeMeta, clearCart } = useCart();
  const router = useRouter();
  const { user, authReady } = useAuthUser();
  const [selectedPayment, setSelectedPayment] = useState<'cash' | 'yoco' | 'ozow'>('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  // For cash payments — customer can declare which note they'll pay with so
  // the driver knows whether to bring change. Defaults to exact total.
  const [cashAmount, setCashAmount] = useState<number | ''>('');
  // "Other" toggle — reveals a free-entry fallback for totals no standard
  // note covers alone, or an unusual combination of notes/coins.
  const [showCustomCashInput, setShowCustomCashInput] = useState(false);

  const [formData, setFormData] = useState({
    street: '',
    city: '',
    postalCode: '',
    instructions: '',
    phone: '',
    email: '',
  });

  const [isLocating, setIsLocating] = useState(false);

  // Pre-fill from the authenticated user's profile once auth resolves —
  // email from the Auth object, phone/address from the private
  // users/{uid} Firestore doc (see app/profile/page.tsx, which is what
  // actually writes these fields). Only fills in fields still blank, so it
  // never clobbers something the customer already typed on this order.
  //
  // Read straight from Firestore rather than GET /api/v1/users/me: the
  // profile page stores `address` as {street, city, postalCode}, and the API
  // still models it as a single string, so it would hand back null here.
  useEffect(() => {
    if (!user) return;
    if (user.email) {
      setFormData((prev) => (prev.email ? prev : { ...prev, email: user.email ?? '' }));
    }

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!snap.exists()) return;
        const data = snap.data();
        const address = data.address && typeof data.address === 'object' ? data.address : null;
        setFormData((prev) => ({
          ...prev,
          phone: prev.phone || (typeof data.phone === 'string' ? data.phone : prev.phone),
          street: prev.street || (typeof address?.street === 'string' ? address.street : prev.street),
          city: prev.city || (typeof address?.city === 'string' ? address.city : prev.city),
          postalCode:
            prev.postalCode || (typeof address?.postalCode === 'string' ? address.postalCode : prev.postalCode),
        }));
      } catch (error) {
        console.error('Failed to pre-fill from profile:', error);
      }
    })();
  }, [user]);

  // "Use my location" fills in the nearest township the app recognises.
  //
  // The coordinates themselves are not sent with the order. The API's order
  // schema is strict and has no field for them — it would reject the request
  // — and the server estimates distance from the city on its own, so the
  // browser has no say in a figure that feeds driver payouts.
  const handleUseMyLocation = async () => {
    setIsLocating(true);
    try {
      const position = await getCurrentLocation();
      const { latitude, longitude } = position.coords;
      const nearest = findNearestTownship(latitude, longitude);

      if (nearest) {
        setFormData((prev) => ({ ...prev, city: nearest.area }));
        toast.success(
          nearest.distanceKm < 3
            ? `Set your city to ${nearest.area}`
            : `Nearest area we recognise is ${nearest.area} (${nearest.distanceKm.toFixed(1)}km away) — please check it's right`,
        );
      } else {
        toast.success('Got your location — please fill in your address below.');
      }
    } catch (error) {
      const message =
        error instanceof GeolocationPositionError && error.code === error.PERMISSION_DENIED
          ? 'Location access denied — you can still enter your address manually.'
          : 'Could not get your location — please enter your address manually.';
      toast.error(message);
      console.error('Geolocation error:', error);
    } finally {
      setIsLocating(false);
    }
  };

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
      // Everything that decides money now happens on the server. We send what
      // the customer chose — which store, which items, where to deliver, how
      // they intend to pay — and nothing else. No prices, no totals, no
      // payouts, no payment status, no delivery code.
      //
      // The API rejects those fields outright rather than ignoring them, so
      // if this request ever regrows one the checkout fails loudly instead of
      // appearing to work.
      const order = await placeOrder({
        storeId: storeMeta.id,
        items: cart.items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          ...(item.specialInstructions
            ? { specialInstructions: item.specialInstructions }
            : {}),
        })),
        deliveryAddress: {
          street: formData.street,
          city: formData.city,
          postalCode: formData.postalCode,
          ...(formData.instructions ? { instructions: formData.instructions } : {}),
        },
        paymentMethod: selectedPayment,
        customerPhone: formData.phone,
        // A hint so the driver brings change — never a price.
        ...(cashAmountEffective !== null ? { cashAmount: cashAmountEffective } : {}),
      });

      // Cash is collected at the door, so there is nothing to charge now. The
      // server settles it when the driver confirms delivery.
      if (selectedPayment !== 'cash') {
        await payForOrder(order.id);
      }

      toast.success('Order placed successfully! 🎉');
      clearCart();
      router.push(`/orders/${order.id}`);
    } catch (error) {
      // The API writes its messages for customers, so they are safe to show.
      // A field error is more specific than the summary, so prefer it.
      const message =
        error instanceof ApiError
          ? error.firstFieldError ?? error.message
          : error instanceof Error
            ? error.message
            : 'An error occurred. Please try again.';

      toast.error(message);
      console.error('Checkout error:', error);
      setIsProcessing(false);
    }
  };

  /**
   * Charge a card or EFT order.
   *
   * The server owns settlement: it asks the provider what happened and
   * compares the captured amount against the order total before marking
   * anything paid. Nothing here can declare a payment successful.
   *
   * While the API runs the sandbox provider there is no hosted page to visit,
   * so the charge is resolved through the sandbox endpoint. Against a live
   * provider the same code follows `redirectUrl` instead.
   */
  const payForOrder = async (orderId: string) => {
    const { payment, redirectUrl, clientPayload } = await initiatePayment(orderId);

    if (redirectUrl) {
      // A live provider hosts its own checkout. Verification happens when the
      // customer returns; the order page polls for it.
      window.location.href = redirectUrl;
      return;
    }

    if (isSandboxPayment(clientPayload)) {
      await completeSandboxPayment(payment.providerReference ?? '', 'succeed');
    }

    const verified = await verifyPayment(payment.id);

    if (verified.status === 'failed') {
      throw new Error(
        verified.failureReason ?? 'Payment was declined. Please try another method.',
      );
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-primary" />
                  Delivery Address
                </h2>
                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  disabled={isLocating}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <LocateFixed className="w-4 h-4" />
                  {isLocating ? 'Locating…' : 'Use my location'}
                </button>
              </div>

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

            {/* Cash details — only when cash is selected. Helps driver plan change.
                Customer picks from the real notes they're actually holding (SA
                banknotes: R10/R20/R50/R100/R200) rather than typing an arbitrary
                number — a driver can't act on "I feel like paying R63.50",
                only on an actual note they'll be handed at the door. */}
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
                <p className="block text-sm font-semibold mb-2">
                  Which note will you pay with?
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCashAmount(cart.total)}
                    className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-colors ${
                      cashAmount === cart.total
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    Exact — R{cart.total.toFixed(2)}
                  </button>
                  {CASH_NOTE_DENOMINATIONS.filter((note) => note >= cart.total).map((note) => (
                    <button
                      key={note}
                      type="button"
                      onClick={() => setCashAmount(note)}
                      className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-colors ${
                        cashAmount === note
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      R{note} note
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowCustomCashInput((v) => !v)}
                    className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-colors ${
                      showCustomCashInput
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    Other
                  </button>
                </div>

                {showCustomCashInput && (
                  <div className="flex items-center gap-2 mt-3">
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
                      placeholder={`Total cash you'll hand over`}
                      autoFocus
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                )}

                <p className="text-sm mt-3">
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
