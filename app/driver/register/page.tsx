'use client';

// Driver Registration Page
// Allows drivers to register as delivery partners

import { useState } from 'react';
import { MapPin, Phone, Mail, User, ArrowLeft, Car, Bike } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { auth, db } from '../../../firebase/config';
import { doc, setDoc } from 'firebase/firestore';
import { ApiError } from '../../../services/apiClient';
import { submitDriverDetails } from '../../../services/driverApi';

export default function DriverRegistrationPage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    idNumber: '',
    vehicleType: 'motorbike' as 'motorbike' | 'car' | 'bicycle',
    vehicleRegistration: '',
    licenseNumber: '',
    bankName: '',
    accountHolderName: '',
    accountNumber: '',
    accountType: 'savings' as 'savings' | 'checking',
  });

  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (!auth.currentUser) {
        toast.error('Sign in first, then apply to deliver.');
        setIsLoading(false);
        return;
      }

      // Everything the platform decides with - what they drive, their licence
      // and registration - goes to the API, which validates it and puts the
      // application in the review queue. Nobody delivers until an admin
      // approves it.
      await submitDriverDetails({
        vehicleType: formData.vehicleType,
        idNumber: formData.idNumber,
        licenceNumber: formData.licenseNumber,
        vehicleRegistration: formData.vehicleRegistration,
      });

      // Contact and payout details stay on the person's own profile. Banking
      // details are deliberately not on the world-readable drivers document.
      await setDoc(
        doc(db, 'users', auth.currentUser.uid),
        {
          role: 'driver',
          email: formData.email,
          phone: formData.phone,
          firstName: formData.firstName,
          lastName: formData.lastName,
          bankName: formData.bankName,
          accountHolderName: formData.accountHolderName,
          accountNumber: formData.accountNumber,
          accountType: formData.accountType,
          updatedAt: new Date(),
        },
        { merge: true },
      );

      // What actually happens now, rather than a wait invented to look busy.
      toast.success(
        'Sent for checking. You will be told in the driver app when you are approved.',
      );
      setIsLoading(false);
      window.location.href = '/driver/dashboard';
    } catch (error) {
      console.error('Registration error:', error);
      // The API says which field is wrong and why; passing that on is the
      // difference between a fixable form and a dead end.
      toast.error(
        error instanceof ApiError
          ? error.firstFieldError ?? error.message
          : 'Could not send your application. Please try again.',
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-4">
          <ArrowLeft className="w-5 h-5" />
          Back to Home
        </Link>

        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Become a Delivery Partner</h1>
            <p className="text-gray-600">Join LokshinEats and earn money delivering food in your community</p>
          </div>

          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-lg p-8 space-y-6"
          >
            {/* Personal Information */}
            <div>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                Personal Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">First Name</label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Thabo"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Last Name</label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Mokoena"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="thabo@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="+27 83 123 4567"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-semibold mb-2">ID Number</label>
                <input
                  type="text"
                  name="idNumber"
                  value={formData.idNumber}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="South African ID Number"
                />
              </div>
            </div>

            {/* Vehicle Information */}
            <div>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                Vehicle Information
              </h2>

              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Vehicle Type</label>
                <div className="grid grid-cols-3 gap-4">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, vehicleType: 'motorbike' })}
                    className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-colors ${
                      formData.vehicleType === 'motorbike'
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <Bike className="w-8 h-8" />
                    <span className="font-semibold">Motorbike</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, vehicleType: 'car' })}
                    className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-colors ${
                      formData.vehicleType === 'car'
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <Car className="w-8 h-8" />
                    <span className="font-semibold">Car</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, vehicleType: 'bicycle' })}
                    className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-colors ${
                      formData.vehicleType === 'bicycle'
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <Bike className="w-8 h-8" />
                    <span className="font-semibold">Bicycle</span>
                  </button>
                </div>
              </div>

              {formData.vehicleType === 'bicycle' ? (
                <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
                  No license or vehicle registration needed for a bicycle. Skip ahead.
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Vehicle Registration</label>
                    <input
                      type="text"
                      name="vehicleRegistration"
                      value={formData.vehicleRegistration}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="CA 123 456"
                    />
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-semibold mb-2">Driver's License Number</label>
                    <input
                      type="text"
                      name="licenseNumber"
                      value={formData.licenseNumber}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="License Number"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Bank Information */}
            <div>
              <h2 className="text-xl font-bold mb-4">Bank Information</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Bank Name</label>
                  <input
                    type="text"
                    name="bankName"
                    value={formData.bankName}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="FNB, Standard Bank, etc."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Account Holder Name</label>
                  <input
                    type="text"
                    name="accountHolderName"
                    value={formData.accountHolderName}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="As it appears on the account"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Account Number</label>
                  <input
                    type="text"
                    name="accountNumber"
                    value={formData.accountNumber}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Account Number"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-semibold mb-2">Account Type</label>
                <select
                  name="accountType"
                  value={formData.accountType}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="savings">Savings Account</option>
                  <option value="checking">Checking Account</option>
                </select>
              </div>
            </div>

            {/* What happens to these details */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h2 className="text-lg font-bold mb-2">Before you can deliver</h2>
              <p className="text-sm text-amber-900">
                LokshinEats checks these details before approving you. You will
                be told in the driver app when that is done, and you can take
                deliveries from that moment. Keep your licence and vehicle
                registration with you while you work — we may ask to see them.
              </p>
            </div>

            {/* Terms */}
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                required
                className="mt-1 w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
              />
              <label className="text-sm text-gray-600">
                I agree to the{' '}
                <Link href="/terms" className="text-primary hover:underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                {' '}for delivery partners
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Submitting...' : 'Submit Application'}
            </button>
          </motion.form>
        </div>
      </div>
    </div>
  );
}
