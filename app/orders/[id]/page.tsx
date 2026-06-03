'use client';

// Order Tracking Page
// Customer's view of a single order. Subscribes to the order doc via
// onSnapshot so the status tracker updates live as the vendor + driver
// advance the order.
// Live map will be wired up in Phase 5 (driver location tracking).

import { use, useEffect, useState } from 'react';
import {
  CheckCircle,
  Clock,
  Package,
  Truck,
  MapPin,
  Phone,
  Star,
  ArrowLeft,
  Navigation,
} from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useAuthUser } from '../../../hooks/useAuthUser';

// ---------------------------------------------------------------------------
// Types

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'delivered'
  | 'cancelled';

type OrderView = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  storeId: string;
  storeName: string;
  driverId: string | null;
  status: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  total: number;
  items: { name: string; price: number; quantity: number }[];
  deliveryAddress: {
    street: string;
    city: string;
    postalCode: string;
    instructions?: string;
  } | null;
  createdAt: Date;
  estimatedDeliveryTime: Date | null;
  paymentMethod: string;
  paymentStatus: string;
  reviewed: boolean;
  ratingGiven: number | null;
  driverRated: boolean;
  driverRatingGiven: number | null;
  deliveryOTP: string | null;
  deliveryOTPVerified: boolean;
  cashAmount: number | null;
};

const orderSteps: { key: OrderStatus; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'pending', label: 'Order Placed', icon: CheckCircle },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle },
  { key: 'preparing', label: 'Preparing', icon: Package },
  { key: 'ready', label: 'Ready for Pickup', icon: Package },
  { key: 'picked_up', label: 'On the Way', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle },
];

const statusOrder: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'picked_up',
  'delivered',
];

function tsToDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v.toDate === 'function') return v.toDate();
  return null;
}

// ---------------------------------------------------------------------------

export default function OrderTrackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, authReady } = useAuthUser();

  const [order, setOrder] = useState<OrderView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Store-review submission UI state
  const [reviewStars, setReviewStars] = useState(0);
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Driver-review submission UI state
  const [driverStars, setDriverStars] = useState(0);
  const [driverHover, setDriverHover] = useState(0);
  const [driverComment, setDriverComment] = useState('');
  const [isSubmittingDriverReview, setIsSubmittingDriverReview] = useState(false);

  const submitReview = async () => {
    if (!order || !user) return;
    if (reviewStars < 1 || reviewStars > 5) {
      toast.error('Pick a star rating from 1 to 5');
      return;
    }
    setIsSubmittingReview(true);

    try {
      const reviewRef = doc(collection(db, 'reviews'));
      const storeRef = doc(db, 'stores', order.storeId);
      const orderRef = doc(db, 'orders', order.id);

      // Atomic: read store, recompute average, write review + order + store.
      await runTransaction(db, async (tx) => {
        const storeSnap = await tx.get(storeRef);
        if (!storeSnap.exists()) throw new Error('Restaurant no longer exists');

        const sd = storeSnap.data();
        const prevRating = typeof sd.rating === 'number' ? sd.rating : 0;
        const prevCount = typeof sd.reviewCount === 'number' ? sd.reviewCount : 0;
        const newCount = prevCount + 1;
        // Running average: rounded to 1 decimal place for display
        const newRating = Math.round(((prevRating * prevCount + reviewStars) / newCount) * 10) / 10;

        tx.set(reviewRef, {
          customerId: user.uid,
          customerName: order.customerName,
          storeId: order.storeId,
          orderId: order.id,
          rating: reviewStars,
          comment: reviewComment.trim(),
          createdAt: serverTimestamp(),
        });

        tx.update(orderRef, {
          reviewed: true,
          ratingGiven: reviewStars,
        });

        tx.update(storeRef, {
          rating: newRating,
          reviewCount: newCount,
        });
      });

      toast.success('Thanks for the review! ⭐');
      // The onSnapshot listener on this page will refresh `order.reviewed`
      // automatically, so the UI flips to "You rated X" without manual state work.
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not submit review';
      toast.error(msg);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const submitDriverReview = async () => {
    if (!order || !user || !order.driverId) return;
    if (driverStars < 1 || driverStars > 5) {
      toast.error('Pick a star rating from 1 to 5');
      return;
    }
    setIsSubmittingDriverReview(true);

    try {
      // Driver-rating aggregates are computed on read from driverReviews docs
      // (cheaper than maintaining a denormalized counter and avoids the
      // create-vs-update rule complication on drivers/{uid}). So this
      // transaction only needs to write the review + mark the order rated.
      const reviewRef = doc(collection(db, 'driverReviews'));
      const orderRef = doc(db, 'orders', order.id);

      await runTransaction(db, async (tx) => {
        tx.set(reviewRef, {
          customerId: user.uid,
          customerName: order.customerName,
          driverId: order.driverId,
          orderId: order.id,
          rating: driverStars,
          comment: driverComment.trim(),
          createdAt: serverTimestamp(),
        });

        tx.update(orderRef, {
          driverRated: true,
          driverRatingGiven: driverStars,
        });
      });

      toast.success('Driver rated. Thanks! 🚴');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not submit driver rating';
      toast.error(msg);
    } finally {
      setIsSubmittingDriverReview(false);
    }
  };

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    // Live subscription — order doc updates re-render automatically as the
    // vendor + driver advance the status.
    const unsub = onSnapshot(
      doc(db, 'orders', id),
      (snap) => {
        if (!snap.exists()) {
          setOrder(null);
          setIsLoading(false);
          return;
        }
        const data = snap.data();
        const items = Array.isArray(data.items)
          ? data.items.map((it: any) => ({
              name: it.product?.name ?? 'Item',
              price: typeof it.product?.price === 'number' ? it.product.price : 0,
              quantity: typeof it.quantity === 'number' ? it.quantity : 1,
            }))
          : [];

        setOrder({
          id: snap.id,
          customerId: data.customerId,
          customerName: data.customerName ?? 'Customer',
          customerPhone: typeof data.customerPhone === 'string' ? data.customerPhone : null,
          storeId: data.storeId,
          storeName: data.storeName ?? 'Unknown store',
          driverId: data.driverId ?? null,
          status: (data.status as OrderStatus) ?? 'pending',
          subtotal: typeof data.subtotal === 'number' ? data.subtotal : 0,
          deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 0,
          total: typeof data.total === 'number' ? data.total : 0,
          items,
          deliveryAddress: data.deliveryAddress ?? null,
          createdAt: tsToDate(data.createdAt) ?? new Date(),
          estimatedDeliveryTime: tsToDate(data.estimatedDeliveryTime),
          paymentMethod: data.paymentMethod ?? 'cash',
          paymentStatus: data.paymentStatus ?? 'pending',
          reviewed: data.reviewed === true,
          ratingGiven: typeof data.ratingGiven === 'number' ? data.ratingGiven : null,
          driverRated: data.driverRated === true,
          driverRatingGiven: typeof data.driverRatingGiven === 'number' ? data.driverRatingGiven : null,
          deliveryOTP: typeof data.deliveryOTP === 'string' ? data.deliveryOTP : null,
          deliveryOTPVerified: data.deliveryOTPVerified === true,
          cashAmount: typeof data.cashAmount === 'number' ? data.cashAmount : null,
        });
        setIsLoading(false);
      },
      (err) => {
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
      },
    );

    return unsub;
  }, [id, user, authReady]);

  // ---- Render branches ----------------------------------------------------

  if (!authReady || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <div className="h-4 w-24 bg-gray-200 rounded mb-4 animate-pulse" />
          <div className="h-9 w-64 bg-gray-200 rounded mb-6 animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl shadow-md p-6 animate-pulse">
                <div className="h-6 w-32 bg-gray-200 rounded mb-6" />
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 bg-gray-200 rounded-full" />
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="font-semibold mb-2">Sign in to view your order</p>
          <Link href="/auth/login" className="text-primary underline">Go to login</Link>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <p className="text-red-600 font-semibold mb-2">Could not load order</p>
          <p className="text-gray-500 text-sm font-mono break-all mb-4">{errorMessage}</p>
          <Link href="/orders" className="text-primary underline">Back to orders</Link>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <p className="font-semibold text-gray-700 mb-2">Order not found</p>
          <p className="text-gray-500 mb-4">No order exists with id <span className="font-mono">{id}</span>.</p>
          <Link href="/orders" className="text-primary underline">Back to orders</Link>
        </div>
      </div>
    );
  }

  // Defense in depth: rules already restrict reads, but if somehow another
  // user's order leaks through, refuse to render it.
  if (order.customerId !== user.uid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="font-semibold text-gray-700 mb-2">Not your order</p>
          <Link href="/orders" className="text-primary underline">Back to your orders</Link>
        </div>
      </div>
    );
  }

  const isCancelled = order.status === 'cancelled';
  const currentStepIndex = isCancelled ? -1 : statusOrder.indexOf(order.status);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <Link href="/orders" className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-4">
          <ArrowLeft className="w-5 h-5" />
          Back to Orders
        </Link>

        <h1 className="text-3xl font-bold mb-1">Track Your Order</h1>
        <p className="text-sm text-gray-500 mb-6">
          #{order.id} · {order.createdAt.toLocaleDateString()}{' '}
          {order.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Order Status */}
          <div className="lg:col-span-2 space-y-6">
            {/* Cancelled Banner */}
            {isCancelled && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="font-semibold text-red-800">This order was cancelled</p>
                <p className="text-sm text-red-700">
                  Contact the restaurant or your driver if you have questions.
                </p>
              </div>
            )}

            {/* Progress Tracker */}
            {!isCancelled && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl shadow-md p-6"
              >
                <h2 className="text-xl font-bold mb-6">Order Status</h2>

                <div className="space-y-4">
                  {orderSteps.map((step, index) => {
                    const Icon = step.icon;
                    const isCompleted = index <= currentStepIndex;
                    const isCurrent = index === currentStepIndex;
                    const isFinalDelivered = isCurrent && step.key === 'delivered';

                    return (
                      <div key={step.key} className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            isCompleted ? 'bg-primary text-white' : 'bg-gray-200 text-gray-400'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <p
                            className={`font-semibold ${
                              isCurrent ? 'text-primary' : isCompleted ? 'text-gray-900' : 'text-gray-400'
                            }`}
                          >
                            {step.label}
                          </p>
                        </div>
                        {isFinalDelivered ? (
                          <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-sm font-semibold">Completed</span>
                          </div>
                        ) : (
                          isCurrent && (
                            <div className="flex items-center gap-2 text-primary">
                              <Clock className="w-4 h-4" />
                              <span className="text-sm font-semibold">In Progress</span>
                            </div>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>

                <p className="mt-4 text-xs text-gray-500">
                  Live — status updates appear automatically as your order progresses.
                </p>
              </motion.div>
            )}

            {/* Delivery OTP — shown while order is in transit (picked_up).
                Hidden before pickup (not needed yet) and after delivery. */}
            {order.status === 'picked_up' && order.deliveryOTP && !order.deliveryOTPVerified && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-br from-primary to-primary-dark text-white rounded-xl shadow-md p-6"
              >
                <h2 className="text-xl font-bold mb-2">Your delivery code</h2>
                <p className="text-white/80 text-sm mb-4">
                  Read this code to your driver when they arrive with your food. Don't share it
                  before they hand over your order.
                </p>
                <div className="bg-white/15 rounded-2xl py-6 text-center">
                  <p className="text-5xl md:text-6xl font-bold tracking-widest font-mono">
                    {order.deliveryOTP}
                  </p>
                </div>
                <p className="text-xs text-white/70 mt-3">
                  The driver enters this in their app to confirm delivery and payment received.
                </p>
              </motion.div>
            )}

            {/* Cash payment reminder — shown for cash orders once the kitchen is preparing,
                so the customer has time to find the right notes before the driver arrives. */}
            {order.paymentMethod === 'cash' && !isCancelled &&
              ['preparing', 'ready', 'picked_up'].includes(order.status) && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-amber-50 border border-amber-200 rounded-xl shadow-md p-6"
                >
                  <div className="flex items-start gap-3">
                    <div className="text-3xl">💵</div>
                    <div className="flex-1">
                      <h2 className="text-lg font-bold text-amber-900 mb-1">
                        {order.cashAmount && order.cashAmount > order.total
                          ? `Have R${order.cashAmount.toFixed(2)} ready`
                          : `Have R${order.total.toFixed(2)} ready`}
                      </h2>
                      <p className="text-sm text-amber-800">
                        {order.cashAmount && order.cashAmount > order.total ? (
                          <>
                            Driver will bring{' '}
                            <strong>R{(order.cashAmount - order.total).toFixed(2)}</strong> in
                            change.
                          </>
                        ) : (
                          <>Exact amount — no change needed.</>
                        )}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

            {/* Driver assigned — placeholder for Phase 5 live map */}
            {order.driverId && !isCancelled && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl shadow-md p-6"
              >
                <h2 className="text-xl font-bold mb-4">Driver assigned</h2>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                  <Navigation className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                  <p className="font-semibold text-gray-700">Live map tracking coming soon</p>
                  <p className="text-sm text-gray-500">
                    Once we wire driver location updates (Phase 5), you'll see your courier moving on a map here.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Order Details */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-xl shadow-md p-6"
            >
              <h2 className="text-xl font-bold mb-4">Order Details</h2>

              <div className="space-y-3 mb-4">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>
                      {item.quantity}x {item.name}
                    </span>
                    <span className="font-semibold">R{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-200 pt-4 space-y-2">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>R{order.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Delivery Fee</span>
                  <span>R{order.deliveryFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span className="text-primary">R{order.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="mt-4 text-sm text-gray-600">
                <span className="font-semibold capitalize">{order.paymentMethod}</span>{' '}
                · <span className="capitalize">{order.paymentStatus}</span>
              </div>
            </motion.div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Store Info */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-xl shadow-md p-6"
            >
              <h2 className="text-xl font-bold mb-4">Restaurant</h2>

              <div className="space-y-3">
                <p className="font-semibold">{order.storeName}</p>
                <Link
                  href={`/restaurants/${order.storeId}`}
                  className="text-sm text-primary hover:underline"
                >
                  View menu
                </Link>
              </div>
            </motion.div>

            {/* Delivery Address */}
            {order.deliveryAddress && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-xl shadow-md p-6"
              >
                <h2 className="text-xl font-bold mb-4">Delivery Address</h2>

                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">{order.deliveryAddress.street}</p>
                    <p className="text-sm text-gray-600">
                      {order.deliveryAddress.city}, {order.deliveryAddress.postalCode}
                    </p>
                    {order.deliveryAddress.instructions && (
                      <p className="text-sm text-gray-500 mt-1">
                        Instructions: {order.deliveryAddress.instructions}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Customer contact (driver/store would call this) */}
            {order.customerPhone && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
                className="bg-white rounded-xl shadow-md p-6"
              >
                <h2 className="text-xl font-bold mb-4">Contact</h2>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  <span className="text-sm">{order.customerPhone}</span>
                </div>
              </motion.div>
            )}

            {/* Rate Order */}
            {order.status === 'delivered' && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white rounded-xl shadow-md p-6"
              >
                {order.reviewed ? (
                  <div className="text-center">
                    <div className="flex justify-center gap-1 mb-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-6 h-6 ${
                            star <= (order.ratingGiven ?? 0)
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="font-semibold">You rated this {order.ratingGiven} / 5</p>
                    <p className="text-sm text-gray-500 mt-1">Thanks for the feedback!</p>
                  </div>
                ) : (
                  <>
                    <h2 className="text-xl font-bold mb-1">Rate your order</h2>
                    <p className="text-sm text-gray-500 mb-4">
                      How was the food from {order.storeName}?
                    </p>

                    <div
                      className="flex justify-center gap-2 mb-4"
                      onMouseLeave={() => setReviewHover(0)}
                    >
                      {[1, 2, 3, 4, 5].map((star) => {
                        const active = star <= (reviewHover || reviewStars);
                        return (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setReviewStars(star)}
                            onMouseEnter={() => setReviewHover(star)}
                            className="transition-transform hover:scale-110"
                            aria-label={`Rate ${star} stars`}
                          >
                            <Star
                              className={`w-8 h-8 ${
                                active ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>

                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Leave a comment (optional)"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary mb-3"
                    />

                    <button
                      onClick={submitReview}
                      disabled={reviewStars === 0 || isSubmittingReview}
                      className="w-full bg-primary text-white py-2 rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmittingReview ? 'Submitting…' : 'Submit Rating'}
                    </button>
                  </>
                )}
              </motion.div>
            )}

            {/* Rate Driver (only if delivered AND driver was assigned) */}
            {order.status === 'delivered' && order.driverId && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 }}
                className="bg-white rounded-xl shadow-md p-6"
              >
                {order.driverRated ? (
                  <div className="text-center">
                    <div className="flex justify-center gap-1 mb-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-6 h-6 ${
                            star <= (order.driverRatingGiven ?? 0)
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="font-semibold">You rated your driver {order.driverRatingGiven} / 5</p>
                    <p className="text-sm text-gray-500 mt-1">Thanks for the feedback!</p>
                  </div>
                ) : (
                  <>
                    <h2 className="text-xl font-bold mb-1">Rate your driver</h2>
                    <p className="text-sm text-gray-500 mb-4">
                      How was your delivery experience?
                    </p>

                    <div
                      className="flex justify-center gap-2 mb-4"
                      onMouseLeave={() => setDriverHover(0)}
                    >
                      {[1, 2, 3, 4, 5].map((star) => {
                        const active = star <= (driverHover || driverStars);
                        return (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setDriverStars(star)}
                            onMouseEnter={() => setDriverHover(star)}
                            className="transition-transform hover:scale-110"
                            aria-label={`Rate driver ${star} stars`}
                          >
                            <Star
                              className={`w-8 h-8 ${
                                active ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>

                    <textarea
                      value={driverComment}
                      onChange={(e) => setDriverComment(e.target.value)}
                      placeholder="Leave a comment about your driver (optional)"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary mb-3"
                    />

                    <button
                      onClick={submitDriverReview}
                      disabled={driverStars === 0 || isSubmittingDriverReview}
                      className="w-full bg-primary text-white py-2 rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmittingDriverReview ? 'Submitting…' : 'Submit Driver Rating'}
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
