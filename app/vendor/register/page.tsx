'use client';

// Store Registration Page
// Allows store owners to register their business

import { useState } from 'react';
import { Store, Upload, MapPin, Clock, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { auth, db } from '../../../firebase/config';
import { doc, setDoc } from 'firebase/firestore';

export default function StoreRegistrationPage() {
  const [formData, setFormData] = useState({
    storeName: '',
    cuisine: '',
    description: '',
    address: '',
    city: '',
    phone: '',
    email: '',
    openingTime: '08:00',
    closingTime: '20:00',
    categories: [] as string[],
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [businessRegistrationDocument, setBusinessRegistrationDocument] = useState<File | null>(null);
  const [proofOfAddress, setProofOfAddress] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const cuisineOptions = [
    'Traditional Township Food',
    'Kota Specialist',
    'Braai & Grills',
    'Fast Food',
    'Bakery & Sweets',
    'Groceries & Essentials',
    'Bunny Chow & Curries',
    'Pizza',
    'Chicken & Wings',
    'Other',
  ];

  const categoryOptions = [
    'Traditional',
    'Kota',
    'Braai',
    'Fast Food',
    'Vegetarian',
    'Bakery',
    'Groceries',
    'Drinks',
    'Sweets',
  ];

  const handleCategoryToggle = (category: string) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.categories.length === 0) {
      toast.error('Please select at least one category');
      return;
    }

    setIsLoading(true);

    try {
      // Update user role to vendor in Firestore
      if (auth.currentUser) {
        await setDoc(doc(db, 'users', auth.currentUser.uid), {
          role: 'vendor',
          email: formData.email,
          phone: formData.phone,
          storeName: formData.storeName,
          updatedAt: new Date(),
        }, { merge: true });
      }

      // Simulate store registration (will be replaced with Firebase)
      await new Promise(resolve => setTimeout(resolve, 2000));

      toast.success('Store registered successfully! 🎉');
      setIsLoading(false);

      // Redirect to dashboard
      window.location.href = '/vendor/dashboard';
    } catch (error) {
      console.error('Registration error:', error);
      toast.error('Failed to register store');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <Link href="/vendor/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-4">
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </Link>

        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Register Your Store</h1>
            <p className="text-gray-600">Join LokshinEats and start selling to your community</p>
          </div>

          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-lg p-8 space-y-6"
          >
            {/* Basic Information */}
            <div>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Store className="w-5 h-5 text-primary" />
                Basic Information
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Store Name</label>
                  <input
                    type="text"
                    value={formData.storeName}
                    onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Mama's Kitchen"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Cuisine Type</label>
                  <select
                    value={formData.cuisine}
                    onChange={(e) => setFormData({ ...formData, cuisine: e.target.value })}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select cuisine type</option>
                    {cuisineOptions.map((cuisine) => (
                      <option key={cuisine} value={cuisine}>{cuisine}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    required
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Tell customers about your food and what makes it special..."
                  />
                </div>
              </div>
            </div>

            {/* Categories */}
            <div>
              <h2 className="text-xl font-bold mb-4">Categories</h2>
              <div className="flex flex-wrap gap-2">
                {categoryOptions.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => handleCategoryToggle(category)}
                    className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                      formData.categories.includes(category)
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {/* Location */}
            <div>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                Location
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Street Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="123 Main Street"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">City/Township</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Soweto"
                  />
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div>
              <h2 className="text-xl font-bold mb-4">Contact Information</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Phone Number</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="+27 83 123 4567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="store@example.com"
                  />
                </div>
              </div>
            </div>

            {/* Operating Hours */}
            <div>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Operating Hours
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Opening Time</label>
                  <input
                    type="time"
                    value={formData.openingTime}
                    onChange={(e) => setFormData({ ...formData, openingTime: e.target.value })}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Closing Time</label>
                  <input
                    type="time"
                    value={formData.closingTime}
                    onChange={(e) => setFormData({ ...formData, closingTime: e.target.value })}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Images */}
            <div>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                Images
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Logo</label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="logo-upload"
                    />
                    <label htmlFor="logo-upload" className="cursor-pointer">
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">
                        {logoFile ? logoFile.name : 'Tap to take photo or upload logo'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Camera enabled</p>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Banner Image</label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => setBannerFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="banner-upload"
                    />
                    <label htmlFor="banner-upload" className="cursor-pointer">
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">
                        {bannerFile ? bannerFile.name : 'Tap to take photo or upload banner'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Camera enabled</p>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Business Registration Document</label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => setBusinessRegistrationDocument(e.target.files?.[0] || null)}
                      className="hidden"
                      id="business-doc-upload"
                    />
                    <label htmlFor="business-doc-upload" className="cursor-pointer">
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">
                        {businessRegistrationDocument ? businessRegistrationDocument.name : 'Tap to take photo or upload business registration'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Camera enabled</p>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Proof of Address</label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => setProofOfAddress(e.target.files?.[0] || null)}
                      className="hidden"
                      id="address-doc-upload"
                    />
                    <label htmlFor="address-doc-upload" className="cursor-pointer">
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">
                        {proofOfAddress ? proofOfAddress.name : 'Tap to take photo or upload proof of address'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Camera enabled</p>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Registering...' : 'Register Store'}
            </button>
          </motion.form>
        </div>
      </div>
    </div>
  );
}
