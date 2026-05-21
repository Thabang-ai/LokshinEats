'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import Link from 'next/link';
import toast from 'react-hot-toast';

type SeedStore = {
  id: string;
  name: string;
  description: string;
  cuisine: string;
  image: string;
  address: string;
  city: string;
  rating: number;
  reviewCount: number;
  deliveryTime: string;
  deliveryFee: number;
  minOrderAmount: number;
  isOpen: boolean;
  categories: string[];
};

type SeedProduct = {
  id: string;
  storeId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  available: boolean;
  image: string;
  isVegetarian: boolean;
  isSpicy: boolean;
  preparationTime: number;
};

const SEED_STORES: SeedStore[] = [
  {
    id: '1',
    name: "Mama's Kitchen",
    description:
      'Authentic township flavors passed down through generations. Our recipes bring the warmth of home cooking to your doorstep.',
    cuisine: 'Traditional Township Food',
    image: '🍲',
    address: '123 Main Street, Soweto',
    city: 'Johannesburg',
    rating: 4.8,
    reviewCount: 234,
    deliveryTime: '25-35 min',
    deliveryFee: 15,
    minOrderAmount: 50,
    isOpen: true,
    categories: ['Traditional', 'Pap & Vleis', 'Braai'],
  },
  {
    id: '2',
    name: 'Kota King',
    description: 'The kota specialists — fresh bread, generous fillings, township favourite since day one.',
    cuisine: 'Kota Specialist',
    image: '🍔',
    address: '45 Vilakazi Street, Soweto',
    city: 'Johannesburg',
    rating: 4.6,
    reviewCount: 189,
    deliveryTime: '20-30 min',
    deliveryFee: 10,
    minOrderAmount: 40,
    isOpen: true,
    categories: ['Kota', 'Fast Food'],
  },
  {
    id: '3',
    name: 'Braai Master',
    description: 'Slow-grilled meat done the right way. Boerewors, lamb chops, and chicken straight off the coals.',
    cuisine: 'Braai & Grills',
    image: '🍖',
    address: '78 Khumalo Road, Katlehong',
    city: 'Ekurhuleni',
    rating: 4.9,
    reviewCount: 312,
    deliveryTime: '30-45 min',
    deliveryFee: 20,
    minOrderAmount: 60,
    isOpen: true,
    categories: ['Braai', 'Grill', 'Meat'],
  },
  {
    id: '4',
    name: 'Spaza Shop Express',
    description: 'Your neighbourhood essentials, delivered fast. Bread, milk, snacks, airtime — everything.',
    cuisine: 'Groceries & Essentials',
    image: '🛒',
    address: '12 Mofolo Avenue, Soweto',
    city: 'Johannesburg',
    rating: 4.4,
    reviewCount: 98,
    deliveryTime: '15-25 min',
    deliveryFee: 12,
    minOrderAmount: 30,
    isOpen: true,
    categories: ['Groceries', 'Essentials'],
  },
  {
    id: '5',
    name: 'Bunny Chow House',
    description: 'Durban-style bunny chow and rich curries, packed full of flavour.',
    cuisine: 'Bunny Chow & Curries',
    image: '🥘',
    address: '9 Grey Street, Chatsworth',
    city: 'Durban',
    rating: 4.7,
    reviewCount: 156,
    deliveryTime: '25-40 min',
    deliveryFee: 15,
    minOrderAmount: 45,
    isOpen: false,
    categories: ['Bunny Chow', 'Curry', 'Indian'],
  },
  {
    id: '6',
    name: 'Sweet Treats Bakery',
    description: 'Fresh bakes daily — cakes, koeksisters, vetkoek, and sweets the whole family loves.',
    cuisine: 'Bakery & Sweets',
    image: '🍰',
    address: '34 Acorn Street, Tembisa',
    city: 'Ekurhuleni',
    rating: 4.5,
    reviewCount: 87,
    deliveryTime: '20-30 min',
    deliveryFee: 10,
    minOrderAmount: 35,
    isOpen: true,
    categories: ['Bakery', 'Sweets', 'Cakes'],
  },
];

const SEED_PRODUCTS: SeedProduct[] = [
  // Mama's Kitchen
  { id: '1-pap-vleis', storeId: '1', name: 'Pap & Vleis Combo', description: 'Traditional pap with grilled beef, onion rings, and chakalaka', price: 65, category: 'Main', available: true, image: '🍲', isVegetarian: false, isSpicy: true, preparationTime: 20 },
  { id: '1-mogodu', storeId: '1', name: 'Mogodu', description: 'Traditional tripe stew with pap', price: 55, category: 'Traditional', available: true, image: '🥘', isVegetarian: false, isSpicy: true, preparationTime: 25 },
  { id: '1-veg-stew', storeId: '1', name: 'Vegetable Stew', description: 'Mixed vegetables in mild curry sauce with pap', price: 40, category: 'Vegetarian', available: true, image: '🥗', isVegetarian: true, isSpicy: false, preparationTime: 15 },
  { id: '1-samp-beans', storeId: '1', name: 'Samp & Beans', description: 'Traditional samp with beans and gravy', price: 45, category: 'Traditional', available: false, image: '🥘', isVegetarian: true, isSpicy: false, preparationTime: 30 },
  { id: '1-soft-drink', storeId: '1', name: 'Soft Drink', description: '330ml cold drink', price: 15, category: 'Drinks', available: true, image: '🥤', isVegetarian: true, isSpicy: false, preparationTime: 1 },

  // Kota King
  { id: '2-chicken-kota', storeId: '2', name: 'Chicken Kota', description: 'Quarter chicken with polony, cheese, chips, and egg', price: 45, category: 'Kota', available: true, image: '🍔', isVegetarian: false, isSpicy: false, preparationTime: 12 },
  { id: '2-full-house', storeId: '2', name: 'Full House Kota', description: 'Russian, vienna, polony, cheese, chips, atchar', price: 55, category: 'Kota', available: true, image: '🍔', isVegetarian: false, isSpicy: true, preparationTime: 12 },
  { id: '2-veg-kota', storeId: '2', name: 'Veggie Kota', description: 'Cheese, chips, atchar, lettuce, tomato', price: 35, category: 'Kota', available: true, image: '🥪', isVegetarian: true, isSpicy: false, preparationTime: 10 },
  { id: '2-chips-russian', storeId: '2', name: 'Chips & Russian', description: 'Crispy chips with russian sausage and sauce', price: 35, category: 'Sides', available: true, image: '🍟', isVegetarian: false, isSpicy: false, preparationTime: 8 },

  // Braai Master
  { id: '3-braai-platter', storeId: '3', name: 'Braai Platter', description: 'Mixed grill with boerewors, lamb chops, and chicken wings', price: 120, category: 'Braai', available: true, image: '🍖', isVegetarian: false, isSpicy: false, preparationTime: 35 },
  { id: '3-boerewors-roll', storeId: '3', name: 'Boerewors Roll', description: 'Grilled boerewors in a fresh roll with onions and chutney', price: 35, category: 'Braai', available: true, image: '🌭', isVegetarian: false, isSpicy: false, preparationTime: 15 },
  { id: '3-lamb-chops', storeId: '3', name: 'Lamb Chops (4pc)', description: 'Four flame-grilled lamb chops with pap', price: 95, category: 'Grill', available: true, image: '🍖', isVegetarian: false, isSpicy: false, preparationTime: 25 },

  // Spaza Shop Express
  { id: '4-bread', storeId: '4', name: 'White Bread', description: 'Fresh white loaf', price: 18, category: 'Groceries', available: true, image: '🍞', isVegetarian: true, isSpicy: false, preparationTime: 2 },
  { id: '4-milk', storeId: '4', name: 'Milk 1L', description: 'Full cream milk, 1 litre', price: 22, category: 'Groceries', available: true, image: '🥛', isVegetarian: true, isSpicy: false, preparationTime: 2 },
  { id: '4-airtime', storeId: '4', name: 'R20 Airtime Voucher', description: 'Any major network', price: 20, category: 'Essentials', available: true, image: '📱', isVegetarian: true, isSpicy: false, preparationTime: 1 },

  // Bunny Chow House
  { id: '5-quarter-bunny', storeId: '5', name: 'Quarter Mutton Bunny', description: 'Quarter loaf filled with rich mutton curry', price: 75, category: 'Bunny Chow', available: true, image: '🥘', isVegetarian: false, isSpicy: true, preparationTime: 20 },
  { id: '5-veg-bunny', storeId: '5', name: 'Veg Bunny Chow', description: 'Quarter loaf with bean and vegetable curry', price: 55, category: 'Bunny Chow', available: true, image: '🥘', isVegetarian: true, isSpicy: true, preparationTime: 18 },
  { id: '5-chicken-curry', storeId: '5', name: 'Chicken Curry & Rice', description: 'Traditional Durban-style chicken curry with basmati rice', price: 70, category: 'Curry', available: true, image: '🍛', isVegetarian: false, isSpicy: true, preparationTime: 22 },

  // Sweet Treats Bakery
  { id: '6-vetkoek', storeId: '6', name: 'Vetkoek with Mince', description: 'Fried dough filled with savoury mince', price: 28, category: 'Bakery', available: true, image: '🥯', isVegetarian: false, isSpicy: false, preparationTime: 10 },
  { id: '6-koeksisters', storeId: '6', name: 'Koeksisters (6pc)', description: 'Sweet syrupy braided pastries', price: 35, category: 'Sweets', available: true, image: '🍩', isVegetarian: true, isSpicy: false, preparationTime: 5 },
  { id: '6-choc-cake', storeId: '6', name: 'Chocolate Cake Slice', description: 'Rich chocolate cake, single slice', price: 30, category: 'Cakes', available: true, image: '🍰', isVegetarian: true, isSpicy: false, preparationTime: 3 },
];

// Helpers to build CartItem-shaped entries for orders.
// Looks up a product by id from SEED_PRODUCTS so prices/names always match.
function findProduct(productId: string) {
  const p = SEED_PRODUCTS.find((x) => x.id === productId);
  if (!p) throw new Error(`Seed product not found: ${productId}`);
  return p;
}

function itemOf(productId: string, quantity: number) {
  const p = findProduct(productId);
  return {
    product: {
      id: p.id,
      storeId: p.storeId,
      name: p.name,
      description: p.description,
      price: p.price,
      category: p.category,
      available: p.available,
      isVegetarian: p.isVegetarian,
      isSpicy: p.isSpicy,
      preparationTime: p.preparationTime,
    },
    quantity,
  };
}

const DEFAULT_DELIVERY_FEE = 15;

// minutesAgo / daysAgo helpers — produce real Date objects so Firestore stores actual Timestamps.
function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60 * 1000);
}
function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

type SeedOrderInput = {
  id: string;
  customerName: string;
  status: 'pending' | 'preparing' | 'ready' | 'delivered';
  items: ReturnType<typeof itemOf>[];
  createdAt: Date;
  deliveryAddress?: { street: string; city: string; postalCode: string };
};

// 8 sample orders against store '1' (Mama's Kitchen) — varied statuses + timestamps so the
// vendor dashboard shows realistic numbers immediately.
// IMPORTANT: customerId is set at write time to the current auth user (Firestore rules require it).
const SEED_ORDERS: SeedOrderInput[] = [
  {
    id: 'seed-order-1',
    customerName: 'John Dlamini',
    status: 'pending',
    items: [itemOf('1-pap-vleis', 2)],
    createdAt: minutesAgo(5),
  },
  {
    id: 'seed-order-2',
    customerName: 'Sarah Nkosi',
    status: 'pending',
    items: [itemOf('1-mogodu', 1), itemOf('1-soft-drink', 1)],
    createdAt: minutesAgo(12),
  },
  {
    id: 'seed-order-3',
    customerName: 'Mike Mokoena',
    status: 'preparing',
    items: [itemOf('1-veg-stew', 2)],
    createdAt: minutesAgo(25),
  },
  {
    id: 'seed-order-4',
    customerName: 'Lerato Mthembu',
    status: 'preparing',
    items: [itemOf('1-pap-vleis', 1), itemOf('1-soft-drink', 2)],
    createdAt: minutesAgo(35),
  },
  {
    id: 'seed-order-5',
    customerName: 'Sipho Khumalo',
    status: 'ready',
    items: [itemOf('1-mogodu', 1)],
    createdAt: minutesAgo(50),
  },
  {
    id: 'seed-order-6',
    customerName: 'Thandi Mahlangu',
    status: 'delivered',
    items: [itemOf('1-pap-vleis', 1), itemOf('1-veg-stew', 1)],
    createdAt: minutesAgo(120),
  },
  {
    id: 'seed-order-7',
    customerName: 'Bongani Sithole',
    status: 'delivered',
    items: [itemOf('1-soft-drink', 3), itemOf('1-veg-stew', 1)],
    createdAt: minutesAgo(300),
  },
  {
    id: 'seed-order-8',
    customerName: 'Nomvula Zulu',
    status: 'delivered',
    items: [itemOf('1-pap-vleis', 2)],
    createdAt: daysAgo(3),
  },
];

type Status = 'idle' | 'running' | 'done' | 'error';

export default function SeedPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const log = (line: string) => setProgress((prev) => [...prev, line]);

  const runSeed = async () => {
    if (!user) {
      toast.error('Please log in first');
      return;
    }
    setStatus('running');
    setProgress([]);
    setErrorMessage(null);

    try {
      for (const store of SEED_STORES) {
        const { id, ...rest } = store;
        await setDoc(doc(db, 'stores', id), {
          ...rest,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
        });
        log(`✓ Store: ${store.name}`);
      }

      for (const product of SEED_PRODUCTS) {
        const { id, ...rest } = product;
        await setDoc(doc(db, 'products', id), rest);
        log(`✓ Product: ${product.name}`);
      }

      log(`Done — ${SEED_STORES.length} stores, ${SEED_PRODUCTS.length} products.`);
      setStatus('done');
      toast.success('Database seeded');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(message);
      setStatus('error');
      toast.error('Seed failed');
    }
  };

  const runOrderSeed = async () => {
    if (!user) {
      toast.error('Please log in first');
      return;
    }
    setStatus('running');
    setProgress([]);
    setErrorMessage(null);

    try {
      const storeId = '1';
      const storeName = "Mama's Kitchen";

      for (const order of SEED_ORDERS) {
        const subtotal = order.items.reduce(
          (sum, it) => sum + it.product.price * it.quantity,
          0,
        );
        const deliveryFee = DEFAULT_DELIVERY_FEE;
        const total = subtotal + deliveryFee;
        const paymentStatus =
          order.status === 'delivered' ? 'paid' : ('pending' as 'paid' | 'pending');

        await setDoc(doc(db, 'orders', order.id), {
          customerId: user.uid, // required by Firestore rules
          customerName: order.customerName, // denormalized — vendors can't read user docs
          storeId,
          storeName, // denormalized for customer-side display
          driverId: null, // explicit null so `where('driverId', '==', null)` matches
          items: order.items,
          status: order.status,
          subtotal,
          deliveryFee,
          total,
          paymentMethod: 'cash' as const,
          paymentStatus,
          deliveryAddress: order.deliveryAddress ?? {
            street: '12 Sample Road',
            city: 'Soweto',
            postalCode: '1804',
          },
          createdAt: order.createdAt,
          ...(order.status === 'delivered' ? { actualDeliveryTime: new Date(order.createdAt.getTime() + 45 * 60 * 1000) } : {}),
        });
        log(`✓ Order ${order.id} (${order.status}) — ${order.customerName} — R${total}`);
      }

      log(`Done — ${SEED_ORDERS.length} orders against store '1'.`);
      setStatus('done');
      toast.success('Sample orders seeded');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(message);
      setStatus('error');
      toast.error('Order seed failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="container mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold mb-2">Seed Firestore</h1>
        <p className="text-gray-600 mb-6">
          Dev-only tools to populate Firestore with sample data. Both operations are idempotent
          (fixed document IDs — re-running overwrites instead of duplicating). All seeded data
          will be attributed to your logged-in user.
        </p>

        {!authReady ? (
          <p className="text-gray-500">Checking auth…</p>
        ) : !user ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <p className="text-yellow-800 mb-3">
              You need to be logged in to seed. Firestore security rules require an authenticated owner.
            </p>
            <Link
              href="/auth/login"
              className="inline-block px-5 py-2 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark"
            >
              Go to login
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md p-6">
            <p className="text-sm text-gray-600 mb-4">
              Signed in as <span className="font-mono">{user.email ?? user.uid}</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="font-semibold mb-1">Stores & products</p>
                <p className="text-xs text-gray-500 mb-3">
                  {SEED_STORES.length} stores · {SEED_PRODUCTS.length} menu items. Stores owned by you.
                </p>
                <button
                  onClick={runSeed}
                  disabled={status === 'running'}
                  className="w-full px-4 py-2 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === 'running' ? 'Seeding…' : 'Seed stores & products'}
                </button>
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <p className="font-semibold mb-1">Sample orders</p>
                <p className="text-xs text-gray-500 mb-3">
                  {SEED_ORDERS.length} orders against store '1' (Mama's Kitchen). Mix of statuses & timestamps.
                </p>
                <button
                  onClick={runOrderSeed}
                  disabled={status === 'running'}
                  className="w-full px-4 py-2 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === 'running' ? 'Seeding…' : 'Seed sample orders'}
                </button>
              </div>
            </div>

            {progress.length > 0 && (
              <pre className="mt-6 max-h-96 overflow-auto bg-gray-900 text-green-300 text-xs p-4 rounded-lg font-mono">
                {progress.join('\n')}
              </pre>
            )}

            {errorMessage && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
                <p className="font-semibold mb-1">Seed failed</p>
                <p className="font-mono break-all">{errorMessage}</p>
              </div>
            )}

            {status === 'done' && (
              <div className="mt-4">
                <Link href="/restaurants" className="text-primary hover:underline font-semibold">
                  → View restaurants
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
