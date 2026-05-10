'use client';

// Order Tracking Page
// Shows real-time order status and delivery tracking

import { useState } from 'react';
import { CheckCircle, Clock, Package, Truck, MapPin, Phone, Star, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import Map from '../../../components/Map';

// Mock order data (will be replaced with Firebase)
const mockOrder = {
  id: 'ORD-12345',
  status: 'preparing',
  createdAt: new Date(),
  estimatedDeliveryTime: new Date(Date.now() + 30 * 60 * 1000),
  items: [
    {
      product: {
        id: '1',
        name: 'Pap & Vleis Combo',
        price: 65,
      },
      quantity: 2,
    },
    {
      product: {
        id: '2',
        name: 'Chicken Kota',
        price: 45,
      },
      quantity: 1,
    },
  ],
  total: 175,
  deliveryFee: 15,
  store: {
    name: "Mama's Kitchen",
    address: '123 Main Street, Soweto',
    phone: '+27 83 123 4567',
  },
  deliveryAddress: {
    street: '456 Oak Avenue',
    city: 'Soweto',
    postalCode: '1800',
  },
  driver: {
    name: 'Thabo Mokoena',
    phone: '+27 82 987 6543',
    vehicle: 'Motorbike',
    rating: 4.8,
  },
};

const orderSteps = [
  { key: 'pending', label: 'Order Placed', icon: CheckCircle },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle },
  { key: 'preparing', label: 'Preparing', icon: Package },
  { key: 'ready', label: 'Ready for Pickup', icon: Package },
  { key: 'picked_up', label: 'On the Way', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle },
];

const statusOrder = ['pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivered'];

export default function OrderTrackingPage({ params }: { params: { id: string } }) {
  const [orderStatus, setOrderStatus] = useState(mockOrder.status);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);

  const currentStepIndex = statusOrder.indexOf(orderStatus);

  const handleRateOrder = () => {
    // Will implement with Firebase
    console.log('Rating:', rating);
    setShowRating(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <Link href="/orders" className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-4">
          <ArrowLeft className="w-5 h-5" />
          Back to Orders
        </Link>

        <h1 className="text-3xl font-bold mb-6">Track Your Order</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Order Status */}
          <div className="lg:col-span-2 space-y-6">
            {/* Progress Tracker */}
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
                      {isCurrent && (
                        <div className="flex items-center gap-2 text-primary">
                          <Clock className="w-4 h-4" />
                          <span className="text-sm font-semibold">In Progress</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Driver Info (only show if picked up) */}
            {currentStepIndex >= 4 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl shadow-md p-6"
              >
                <h2 className="text-xl font-bold mb-4">Your Driver</h2>

                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary-light rounded-full flex items-center justify-center text-2xl">
                    👨‍✈️
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">{mockOrder.driver.name}</h3>
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      <span>{mockOrder.driver.rating}</span>
                    </div>
                    <p className="text-sm text-gray-600">{mockOrder.driver.vehicle}</p>
                  </div>
                  <a
                    href={`tel:${mockOrder.driver.phone}`}
                    className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center hover:bg-primary-dark"
                  >
                    <Phone className="w-6 h-6" />
                  </a>
                </div>

                {/* Live Map */}
                <Map
                  origin={{ lat: -26.2675, lng: 27.8585 }} // Store location (Soweto)
                  destination={{ lat: -26.2700, lng: 27.8600 }} // Delivery address
                  driverLocation={{ lat: -26.2685, lng: 27.8590 }} // Driver location
                  height="300px"
                />
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
                {mockOrder.items.map((item) => (
                  <div key={item.product.id} className="flex justify-between">
                    <span>{item.quantity}x {item.product.name}</span>
                    <span className="font-semibold">R{item.product.price * item.quantity}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-200 pt-4 space-y-2">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>R{mockOrder.total - mockOrder.deliveryFee}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Delivery Fee</span>
                  <span>R{mockOrder.deliveryFee}</span>
                </div>
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span className="text-primary">R{mockOrder.total}</span>
                </div>
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
                <div>
                  <p className="font-semibold">{mockOrder.store.name}</p>
                  <p className="text-sm text-gray-600">{mockOrder.store.address}</p>
                </div>

                <a
                  href={`tel:${mockOrder.store.phone}`}
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <Phone className="w-4 h-4" />
                  <span className="text-sm">{mockOrder.store.phone}</span>
                </a>
              </div>
            </motion.div>

            {/* Delivery Address */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-xl shadow-md p-6"
            >
              <h2 className="text-xl font-bold mb-4">Delivery Address</h2>

              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-primary mt-1" />
                <div>
                  <p className="font-semibold">{mockOrder.deliveryAddress.street}</p>
                  <p className="text-sm text-gray-600">
                    {mockOrder.deliveryAddress.city}, {mockOrder.deliveryAddress.postalCode}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Estimated Delivery */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-primary/10 rounded-xl p-6"
            >
              <div className="flex items-center gap-3">
                <Clock className="w-6 h-6 text-primary" />
                <div>
                  <p className="text-sm text-gray-600">Estimated Delivery</p>
                  <p className="font-bold text-lg">
                    {mockOrder.estimatedDeliveryTime.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Rate Order (only show if delivered) */}
            {currentStepIndex === 5 && !showRating && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <button
                  onClick={() => setShowRating(true)}
                  className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary-dark transition-colors"
                >
                  Rate Your Order
                </button>
              </motion.div>
            )}

            {/* Rating Modal */}
            {showRating && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white rounded-xl shadow-md p-6"
              >
                <h2 className="text-xl font-bold mb-4">Rate Your Order</h2>

                <div className="flex justify-center gap-2 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className="text-3xl hover:scale-110 transition-transform"
                    >
                      {star <= rating ? '⭐' : '☆'}
                    </button>
                  ))}
                </div>

                <textarea
                  placeholder="Leave a review (optional)"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary mb-4"
                  rows={3}
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowRating(false)}
                    className="flex-1 bg-gray-200 py-3 rounded-lg font-semibold hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRateOrder}
                    disabled={rating === 0}
                    className="flex-1 bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Submit
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
