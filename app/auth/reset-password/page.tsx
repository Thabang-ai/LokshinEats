'use client';

// Password Reset Page
// Allows users to reset their password via email

import { useState } from 'react';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../../firebase/config';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      toast.success('Password reset email sent! Check your inbox 📧');
      setEmailSent(true);
    } catch (error: any) {
      console.error('Reset password error:', error);
      toast.error(error.message || 'Failed to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md"
      >
        {/* Back Button */}
        <Link href="/auth/login" className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-6">
          <ArrowLeft className="w-5 h-5" />
          Back to Login
        </Link>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-3xl">L</span>
          </div>
          <h1 className="text-2xl font-bold">Reset Password</h1>
          <p className="text-gray-600">
            {emailSent 
              ? 'Check your email for reset instructions' 
              : 'Enter your email to receive password reset instructions'
            }
          </p>
        </div>

        {!emailSent ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-semibold mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Sending...' : 'Send Reset Email'}
            </button>
          </form>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-8"
          >
            <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Email Sent!</h2>
            <p className="text-gray-600 mb-6">
              We've sent password reset instructions to <strong>{email}</strong>
            </p>
            <p className="text-sm text-gray-500 mb-6">
              If you don't receive the email within a few minutes, check your spam folder.
            </p>
            <button
              onClick={() => setEmailSent(false)}
              className="text-primary hover:underline font-semibold"
            >
              Try another email
            </button>
          </motion.div>
        )}

        {/* Sign Up Link */}
        <p className="text-center text-gray-600 mt-6">
          Don't have an account?{' '}
          <Link href="/auth/signup" className="text-primary hover:underline font-semibold">
            Sign up
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
