'use client';

// Individual Order Page for Drivers
// Shows details of a specific delivery order

import { useState } from 'react';
import { ArrowLeft, MapPin, Phone, Package, Clock, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useParams, useRouter } from 'next/navigation';

export default function DriverOrderPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;
  
  const [orderStatus, setOrderStatus] = useState<'accepted' | 'picked_up' | 'delivered'>('accepted');
  const [isLoading, setIsLoading] = useState(false);

  // Mock order data (would be fetched from Firestore)
  const orderData = {
    id: orderId,
    storeName: "Mama's Kitchen",
    storeAddress: '123 Main Street, Soweto',
    customerName: 'John Dlamini',
    customerPhone: '+27 83 123 4567',
    customerAddress: '456 Oak Avenue, Soweto',
    items: ['Pap & Vleis Combo x2', 'Chicken Kota x1'],
    deliveryFee: 25,
    estimatedTime: '12 min',
    distance: '2.5 km',
  };

  const handleStatusUpdate = async (newStatus: 'picked_up' | 'delivered') => {
    setIsLoading(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setOrderStatus(newStatus);
      
      if (newStatus === 'picked_up') {
        toast.success('Order picked up successfully! 🚗');
      } else if (newStatus === 'delivered') {
        toast.success('Order delivered successfully! ✅');
        setTimeout(() => {
          router.push('/driver/dashboard');
        }, 2000);
      }
    } catch (error) {
      toast.error('Failed to update order status');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRejectOrder = async () => {
    setIsLoading(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast.success('Order rejected');
      router.push('/driver/dashboard');
    } catch (error) {
      toast.error('Failed to reject order');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 text-white">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/driver/dashboard" className="p-2 hover:bg-white/10 rounded-full">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Order #{orderData.id}</h1>
              <p className="text-white/80">{orderData.storeName}</p>
            </div>
          </div>

          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full">
            {orderStatus === 'accepted' && <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>}
            {orderStatus === 'picked_up' && <span className="w-2 h-2 bg-blue-400 rounded-full"></span>}
            {orderStatus === 'delivered' && <span className="w-2 h-2 bg-green-400 rounded-full"></span>}
            <span className="font-semibold">
              {orderStatus === 'accepted' && 'Order Accepted'}
              {orderStatus === 'picked_up' && 'In Transit'}
              {orderStatus === 'delivered' && 'Delivered'}
            </span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto space-y-6"
        >
          {/* Route Information */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-bold mb-4">Delivery Route</h2>
            
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Pick Up</p>
                  <p className="font-semibold">{orderData.storeAddress}</p>
                  <p className="text-sm text-gray-600">{orderData.storeName}</p>
                </div>
              </div>

              <div className="border-l-2 border-dashed border-gray-300 h-8 ml-5"></div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Drop Off</p>
                  <p className="font-semibold">{orderData.customerAddress}</p>
                  <p className="text-sm text-gray-600">{orderData.customerName}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Order Details */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-bold mb-4">Order Details</h2>
            
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-gray-600">
                <Package className="w-4 h-4" />
                <span>{orderData.items.join(', ')}</span>
              </div>
              
              <div className="flex items-center gap-2 text-gray-600">
                <Clock className="w-4 h-4" />
                <span>Est. {orderData.estimatedTime}</span>
              </div>
              
              <div className="flex items-center gap-2 text-gray-600">
                <Phone className="w-4 h-4" />
                <span>{orderData.distance}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Delivery Fee</span>
                <span className="text-2xl font-bold text-primary">R{orderData.deliveryFee}</span>
              </div>
            </div>
          </div>

          {/* Customer Contact */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-bold mb-4">Customer Contact</h2>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{orderData.customerName}</p>
                <p className="text-gray-600">{orderData.customerPhone}</p>
              </div>
              <a
                href={`tel:${orderData.customerPhone}`}
                className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition-colors"
              >
                <Phone className="w-4 h-4" />
                Call
              </a>
            </div>
          </div>

          {/* Action Buttons */}
          {orderStatus !== 'delivered' && (
            <div className="space-y-3">
              {orderStatus === 'accepted' && (
                <button
                  onClick={() => handleStatusUpdate('picked_up')}
                  disabled={isLoading}
                  className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Package className="w-5 h-5" />
                  {isLoading ? 'Updating...' : 'Mark as Picked Up'}
                </button>
              )}

              {orderStatus === 'picked_up' && (
                <button
                  onClick={() => handleStatusUpdate('delivered')}
                  disabled={isLoading}
                  className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  {isLoading ? 'Updating...' : 'Mark as Delivered'}
                </button>
              )}

              <button
                onClick={handleRejectOrder}
                disabled={isLoading}
                className="w-full bg-red-100 text-red-600 py-4 rounded-xl font-bold text-lg hover:bg-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <XCircle className="w-5 h-5" />
                {isLoading ? 'Cancelling...' : 'Reject Order'}
              </button>
            </div>
          )}

          {orderStatus === 'delivered' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-green-50 border-2 border-green-200 rounded-xl p-8 text-center"
            >
              <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-green-700 mb-2">Order Delivered!</h2>
              <p className="text-green-600">
                You earned R{orderData.deliveryFee} for this delivery
              </p>
              <p className="text-sm text-green-500 mt-2">Redirecting to dashboard...</p>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
