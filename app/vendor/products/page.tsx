'use client';

// Product Management Page
// Lists every product belonging to the vendor's store. Toggle availability + delete inline.

import RoleGuard from '../../../components/RoleGuard';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Search, Filter, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../../firebase/config';
import { useVendorStore } from '../../../hooks/useVendorStore';

// ---------------------------------------------------------------------------
// Types

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  available: boolean;
  isVegetarian: boolean;
  isSpicy: boolean;
  image: string;
};

// ---------------------------------------------------------------------------

export default function ProductsPage() {
  const { store, isLoading: isStoreLoading, error: storeError } = useVendorStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [areProductsLoading, setAreProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showUnavailable, setShowUnavailable] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!store) {
      setProducts([]);
      setAreProductsLoading(false);
      return;
    }

    let cancelled = false;
    setAreProductsLoading(true);
    setProductsError(null);

    (async () => {
      try {
        // Single-field equality filter — no composite index required.
        const snapshot = await getDocs(
          query(collection(db, 'products'), where('storeId', '==', store.id)),
        );
        const rows: Product[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? 'Unnamed',
            description: data.description ?? '',
            price: typeof data.price === 'number' ? data.price : 0,
            category: data.category ?? 'Other',
            available: data.available !== false,
            isVegetarian: data.isVegetarian === true,
            isSpicy: data.isSpicy === true,
            image: data.image ?? '🍽️',
          };
        });
        // Sort client-side: available first, then alphabetical.
        rows.sort((a, b) => {
          if (a.available !== b.available) return a.available ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        if (!cancelled) {
          setProducts(rows);
          setAreProductsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setProductsError(err instanceof Error ? err.message : String(err));
          setAreProductsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [store]);

  // Derived data
  const categories = useMemo(
    () => ['All', ...Array.from(new Set(products.map((p) => p.category)))],
    [products],
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return products.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
      const matchesAvailability = showUnavailable || p.available;
      return matchesSearch && matchesCategory && matchesAvailability;
    });
  }, [products, searchQuery, selectedCategory, showUnavailable]);

  // Optimistic toggle: flip locally, rollback on error.
  const toggleAvailability = async (productId: string) => {
    const target = products.find((p) => p.id === productId);
    if (!target) return;
    const next = !target.available;

    setUpdatingId(productId);
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, available: next } : p)),
    );

    try {
      await updateDoc(doc(db, 'products', productId), { available: next });
      toast.success(next ? 'Product available' : 'Product hidden');
    } catch (err) {
      // Rollback
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, available: !next } : p)),
      );
      toast.error(err instanceof Error ? err.message : 'Failed to update product');
    } finally {
      setUpdatingId(null);
    }
  };

  // Optimistic delete: remove locally, rollback (re-insert) on error.
  const deleteProduct = async (productId: string) => {
    if (typeof window === 'undefined' || !window.confirm('Delete this product? This cannot be undone.')) {
      return;
    }
    const target = products.find((p) => p.id === productId);
    if (!target) return;
    const previous = products;

    setUpdatingId(productId);
    setProducts((prev) => prev.filter((p) => p.id !== productId));

    try {
      await deleteDoc(doc(db, 'products', productId));
      toast.success('Product deleted');
    } catch (err) {
      // Rollback to previous full list (preserves order)
      setProducts(previous);
      toast.error(err instanceof Error ? err.message : 'Failed to delete product');
    } finally {
      setUpdatingId(null);
    }
  };

  // ---- Render branches -----------------------------------------------------

  if (isStoreLoading) {
    return (
      <RoleGuard allowedRoles={['vendor']}>
        <PageSkeleton />
      </RoleGuard>
    );
  }

  if (storeError) {
    return (
      <RoleGuard allowedRoles={['vendor']}>
        <ErrorState message={storeError} />
      </RoleGuard>
    );
  }

  if (!store) {
    return (
      <RoleGuard allowedRoles={['vendor']}>
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Set up your store first</h1>
            <p className="text-gray-600 mb-6">
              You need a registered store before you can add products.
            </p>
            <Link
              href="/vendor/register"
              className="inline-block px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark"
            >
              Register your store
            </Link>
          </div>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={['vendor']}>
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <Link
                href="/vendor/dashboard"
                className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to Dashboard
              </Link>
              <h1 className="text-3xl font-bold">Products</h1>
              <p className="text-sm text-gray-500 mt-1">{store.name}</p>
            </div>

            <Link
              href="/vendor/products/new"
              className="bg-primary text-white px-4 py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Product
            </Link>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl shadow-md p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-gray-400" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showUnavailable}
                  onChange={(e) => setShowUnavailable(e.target.checked)}
                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                />
                <span className="text-sm">Show unavailable</span>
              </label>
            </div>
          </div>

          {/* Products List */}
          {areProductsLoading ? (
            <ListSkeleton />
          ) : productsError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
              <p className="font-semibold mb-1">Could not load products</p>
              <p className="font-mono break-all">{productsError}</p>
            </div>
          ) : products.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Plus className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-2">No products yet</h2>
              <p className="text-gray-600 mb-6">
                Add your first menu item to start receiving orders.
              </p>
              <Link
                href="/vendor/products/new"
                className="inline-block px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark"
              >
                Add your first product
              </Link>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
              <p className="text-gray-500">No products match your filters</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              <div className="divide-y divide-gray-200">
                {filteredProducts.map((product, index) => {
                  const isUpdating = updatingId === product.id;
                  return (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-primary-light to-primary rounded-lg flex items-center justify-center text-3xl flex-shrink-0">
                          {product.image}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-1">
                            <h3 className="font-semibold text-lg">{product.name}</h3>
                            <span className="font-bold text-lg text-primary">R{product.price}</span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{product.description}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">
                              {product.category}
                            </span>
                            {product.isVegetarian && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                                Vegetarian
                              </span>
                            )}
                            {product.isSpicy && (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                                Spicy
                              </span>
                            )}
                            {!product.available && (
                              <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full">
                                Unavailable
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleAvailability(product.id)}
                            disabled={isUpdating}
                            className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              product.available
                                ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                : 'bg-green-100 text-green-600 hover:bg-green-200'
                            }`}
                            title={product.available ? 'Hide from menu' : 'Show on menu'}
                          >
                            {isUpdating
                              ? '…'
                              : product.available
                              ? 'Make Unavailable'
                              : 'Make Available'}
                          </button>

                          {/* Edit route doesn't exist yet — button hidden until we build /vendor/products/[id]/edit */}

                          <button
                            onClick={() => deleteProduct(product.id)}
                            disabled={isUpdating}
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete product"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stats */}
          {!areProductsLoading && !productsError && products.length > 0 && (
            <div className="grid grid-cols-3 gap-4 mt-6">
              <StatBlock label="Total Products" value={products.length} />
              <StatBlock
                label="Available"
                value={products.filter((p) => p.available).length}
                valueClass="text-green-600"
              />
              <StatBlock
                label="Unavailable"
                value={products.filter((p) => !p.available).length}
                valueClass="text-gray-400"
              />
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}

// ---------------------------------------------------------------------------
// Sub-components

function StatBlock({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: number;
  valueClass?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-md p-4 text-center">
      <p className={`text-2xl font-bold ${valueClass ?? ''}`}>{value}</p>
      <p className="text-sm text-gray-600">{label}</p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden">
      <div className="divide-y divide-gray-200">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-4 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gray-200 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-5 bg-gray-200 rounded w-1/3" />
                <div className="h-4 bg-gray-200 rounded w-2/3" />
                <div className="h-4 bg-gray-200 rounded w-1/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="h-4 w-32 bg-gray-200 rounded mb-2 animate-pulse" />
        <div className="h-9 w-40 bg-gray-200 rounded mb-6 animate-pulse" />
        <ListSkeleton />
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <p className="text-red-600 font-semibold mb-2">Could not load your store</p>
        <p className="text-gray-500 text-sm font-mono break-all">{message}</p>
      </div>
    </div>
  );
}
