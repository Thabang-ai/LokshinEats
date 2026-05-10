'use client';

// Add New Product Page
// Allows store owners to add new menu items

import { useState } from 'react';
import { Upload, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

export default function NewProductPage() {
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
  const [isLoading, setIsLoading] = useState(false);

  const categories = ['Main', 'Kota', 'Braai', 'Vegetarian', 'Drinks', 'Sides', 'Desserts'];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setFormData({
      ...formData,
      [e.target.name]: value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.price) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsLoading(true);

    // Simulate product creation (will be replaced with Firebase)
    await new Promise(resolve => setTimeout(resolve, 1500));

    toast.success('Product added successfully! 🎉');
    setIsLoading(false);

    // Redirect to products list
    window.location.href = '/vendor/products';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <Link href="/vendor/products" className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-4">
          <ArrowLeft className="w-5 h-5" />
          Back to Products
        </Link>

        <h1 className="text-3xl font-bold mb-6">Add New Product</h1>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-lg p-8 max-w-2xl"
        >
          {/* Product Image */}
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
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
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
            disabled={isLoading}
            className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Adding Product...' : 'Add Product'}
          </button>
        </motion.form>
      </div>
    </div>
  );
}
