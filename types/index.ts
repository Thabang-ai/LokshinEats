// TypeScript types for LokshinEats data models

// User types
export interface User {
  id: string;
  email: string;
  displayName: string;
  phoneNumber?: string;
  address?: string;
  role: 'customer' | 'driver' | 'store_owner' | 'admin';
  createdAt: Date;
}

// Store types
export interface Store {
  id: string;
  name: string;
  description: string;
  cuisine: string;
  ownerId: string;
  logo?: string;
  banner?: string;
  address: string;
  city: string;
  rating: number;
  reviewCount: number;
  deliveryTime: string;
  deliveryFee: number;
  minOrderAmount: number;
  isOpen: boolean;
  categories: string[];
  createdAt: Date;
}

// Product types
export interface Product {
  id: string;
  storeId: string;
  name: string;
  description: string;
  price: number;
  image?: string;
  category: string;
  available: boolean;
  isVegetarian?: boolean;
  isSpicy?: boolean;
  preparationTime: number;
}

// Cart types
export interface CartItem {
  product: Product;
  quantity: number;
  specialInstructions?: string;
}

export interface Cart {
  items: CartItem[];
  storeId?: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
}

// Order types
export interface Order {
  id: string;
  customerId: string;
  storeId: string;
  driverId?: string;
  items: CartItem[];
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'picked_up' | 'delivered' | 'cancelled';
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: 'cash' | 'yoco' | 'ozow';
  paymentStatus: 'pending' | 'paid' | 'failed';
  deliveryAddress: {
    street: string;
    city: string;
    postalCode: string;
    instructions?: string;
  };
  createdAt: Date;
  estimatedDeliveryTime?: Date;
  actualDeliveryTime?: Date;
}

// Review types
export interface Review {
  id: string;
  customerId: string;
  storeId: string;
  orderId: string;
  rating: number;
  comment: string;
  createdAt: Date;
}

// Driver types
export interface Driver {
  id: string;
  userId: string;
  vehicleType: 'motorbike' | 'car' | 'bicycle';
  vehicleRegistration: string;
  licenseNumber: string;
  isOnline: boolean;
  currentOrderId?: string;
  rating: number;
  totalDeliveries: number;
  earnings: number;
}
