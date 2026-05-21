'use client';

// Add New Product Page
// Writes a product doc to Firestore with storeId from the active vendor's store.
// Image upload is intentionally stubbed for now — Phase 6 wires Firebase Storage.

import RoleGuard from '../../../../components/RoleGuard';

import { useState } from 'react';
import { Upload, ArrowLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../firebase/config';
import { useVendorStore } from '../../../../hooks/useVendorStore';

const CATEGORIES = ['Main', 'Kota', 'Braai', 'Vegetarian', 'Drinks', 'Sides', 'Desserts'];

export default function NewProductPage() {
  const router = useRouter();
  const { store, isLoading: isStoreLoading, error: storeError } = useVendorStore();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: 'Main',
    isVegetarian: false,
    isSpicy: false,
    isAvailable: true,
  });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const value =
      e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setFormData({ ...formData, [e.target.name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!store) {
      toast.error('No store linked to your account');
      return;
    }
    if (!formData.name.trim() || !formData.price) {
      toast.error('Name and price are required');
      return;
    }
    const priceNum = parseFloat(formData.price);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      toast.error('Enter a valid price');
      return;
    }

    setIsSubmitting(true);

    try {
      // Image uploads are deferred — Firebase Storage requires the Blaze
      // plan in our project's region. For now every product gets an emoji
      // placeholder; we can wire real uploads when billing is sorted.
      await addDoc(collection(db, 'products'), {
        storeId: store.id, // REQUIRED by firestore rules
        name: formData.name.trim(),
        description: formData.description.trim(),
        price: priceNum,
        category: formData.category,
        available: formData.isAvailable,
        isVegetarian: formData.isVegetarian,
        isSpicy: formData.isSpicy,
        preparationTime: 20, // sensible default; can be made configurable later
        image: '🍽️',
        createdAt: serverTimestamp(),
      });

      toast.success('Product added 🎉');
      router.push('/vendor/products');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add product';
      toast.error(msg);
      setIsSubmitting(false);
    }
  };

  // ---- Render branches -----------------------------------------------------

  if (isStoreLoading) {
    return (
      <RoleGuard allowedRoles={['vendor']}>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-500">Loading…</p>
        </div>
      </RoleGuard>
    );
  }

  if (storeError) {
    return (
      <RoleGuard allowedRoles={['vendor']}>
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="text-center max-w-md">
            <p className="text-red-600 font-semibold mb-2">Could not load your store</p>
            <p className="text-gray-500 text-sm font-mono break-all">{storeError}</p>
          </div>
        </div>
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
          <Link
            href="/vendor/products"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Products
          </Link>

          <h1 className="text-3xl font-bold mb-1">Add New Product</h1>
          <p className="text-sm text-gray-500 mb-6">For {store.name}</p>

          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-lg p-8 max-w-2xl"
          >
            {/* Product Image (stubbed — Phase 6 wires Firebase Storage) */}
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-2">Product Image</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="image-upload"
                />
                <label htmlFor="image-upload" className="cursor-pointer">
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">
                    {imageFile ? imageFile.name : 'Click to upload product image'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Image uploads disabled for now — every product uses an emoji placeholder.
                  </p>
                </label>
              </div>
            </div>

            {/* Product Name */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Product Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g., Pap & Vleis Combo"
              />
            </div>

            {/* Description */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Description</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Describe your product..."
              />
            </div>

            {/* Price */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Price (R) *</label>
              <input
                type="number"
                name="price"
                value={formData.price}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="65.00"
              />
            </div>

            {/* Category */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Category</label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            {/* Options */}
            <div className="mb-6 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="isVegetarian"
                  checked={formData.isVegetarian}
                  onChange={handleChange}
                  className="w-5 h-5 text-primary border-gray-300 rounded focus:ring-primary"
                />
                <span className="text-sm">Vegetarian</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="isSpicy"
                  checked={formData.isSpicy}
                  onChange={handleChange}
                  className="w-5 h-5 text-primary border-gray-300 rounded focus:ring-primary"
                />
                <span className="text-sm">Spicy</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="isAvailable"
                  checked={formData.isAvailable}
                  onChange={handleChange}
                  className="w-5 h-5 text-primary border-gray-300 rounded focus:ring-primary"
                />
                <span className="text-sm">Available (show on menu)</span>
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Adding Product…' : 'Add Product'}
            </button>
          </motion.form>
        </div>
      </div>
    </RoleGuard>
  );
}
