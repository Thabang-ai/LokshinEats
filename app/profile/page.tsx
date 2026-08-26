'use client';

// User Profile Page
// Allows users to view and edit their profile, including profile picture

import { useState, useEffect } from 'react';
import { User, Camera, ArrowLeft, Mail, Phone, MapPin, Save, LogOut } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { auth, db, storage } from '../../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { updateProfile, onAuthStateChanged } from 'firebase/auth';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    street: '',
    city: '',
    postalCode: '',
  });
  const [profilePicture, setProfilePicture] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out successfully');
      router.push('/auth/login');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to logout');
    }
  };

  useEffect(() => {
    // auth.currentUser can still be null right after mount — Firebase Auth
    // restores its session asynchronously. onAuthStateChanged is the
    // reliable way to know when a user is actually available (same pattern
    // as hooks/useVendorStore.ts).
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      setFormData((prev) => ({
        ...prev,
        name: user.displayName || '',
        email: user.email || '',
      }));
      if (user.photoURL) setPreviewUrl(user.photoURL);

      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          const address = data.address && typeof data.address === 'object' ? data.address : null;
          setFormData((prev) => ({
            ...prev,
            // Accounts created before this fix have their name sitting in
            // this Firestore field instead of on the Auth object (signup
            // used to only write it here, never call updateProfile). Fall
            // back to it so existing accounts self-heal — hitting Save
            // writes it to the Auth object properly for next time.
            name: prev.name || (typeof data.displayName === 'string' ? data.displayName : prev.name),
            phone: typeof data.phone === 'string' ? data.phone : prev.phone,
            street: typeof address?.street === 'string' ? address.street : prev.street,
            city: typeof address?.city === 'string' ? address.city : prev.city,
            postalCode: typeof address?.postalCode === 'string' ? address.postalCode : prev.postalCode,
          }));
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB');
        return;
      }
      
      setProfilePicture(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfilePictureUpload = async () => {
    if (!profilePicture || !auth.currentUser) return;

    setIsUploading(true);
    try {
      // Upload to Firebase Storage
      const storageRef = ref(storage, `profile-pictures/${auth.currentUser.uid}/${Date.now()}-${profilePicture.name}`);
      await uploadBytes(storageRef, profilePicture);
      const downloadUrl = await getDownloadURL(storageRef);

      // Persist the URL, not just the upload — otherwise it reverts to the
      // default icon on next load despite the file having uploaded fine.
      await updateProfile(auth.currentUser, { photoURL: downloadUrl });
      await setDoc(
        doc(db, 'users', auth.currentUser.uid),
        { photoURL: downloadUrl, updatedAt: serverTimestamp() },
        { merge: true },
      );

      toast.success('Profile picture uploaded successfully! 🎉');
      setPreviewUrl(downloadUrl);
      setProfilePicture(null);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload profile picture');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (auth.currentUser) {
        // displayName lives on the Firebase Auth user object...
        await updateProfile(auth.currentUser, {
          displayName: formData.name,
        });
        // ...phone and address don't have an Auth-object home, so they go on
        // the private users/{uid} Firestore doc (owner/admin-read-only per
        // firestore.rules) alongside the same fields vendor/driver
        // registration already write there.
        await setDoc(
          doc(db, 'users', auth.currentUser.uid),
          {
            phone: formData.phone,
            // Structured to match checkout's deliveryAddress shape exactly,
            // so checkout can pre-fill straight from this doc with no
            // string-parsing guesswork about which part is the city.
            address: {
              street: formData.street,
              city: formData.city,
              postalCode: formData.postalCode,
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }

      toast.success('Profile updated successfully! 🎉');
    } catch (error) {
      console.error('Update error:', error);
      toast.error('Failed to update profile');
    } finally {
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

        <h1 className="text-3xl font-bold mb-6">My Profile</h1>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl"
        >
          {/* Profile Picture Section */}
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
            <h2 className="text-xl font-bold mb-6">Profile Picture</h2>
            
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="w-32 h-32 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-16 h-16 text-gray-400" />
                  )}
                </div>
                <label
                  htmlFor="profile-picture"
                  className="absolute bottom-0 right-0 bg-primary text-white p-2 rounded-full cursor-pointer hover:bg-primary-dark transition-colors"
                >
                  <Camera className="w-5 h-5" />
                </label>
                <input
                  type="file"
                  id="profile-picture"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {profilePicture && (
                <button
                  onClick={handleProfilePictureUpload}
                  disabled={isUploading}
                  className="bg-primary text-white px-6 py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? 'Uploading...' : 'Upload Picture'}
                </button>
              )}
            </div>
          </div>

          {/* Profile Information */}
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-xl font-bold mb-6">Profile Information</h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-semibold mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter your full name"
                  />
                </div>
              </div>

              {/* Email (read-only) */}
              <div>
                <label className="block text-sm font-semibold mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="email"
                    value={formData.email}
                    disabled
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="your@email.com"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-semibold mb-2">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="+27 XX XXX XXXX"
                  />
                </div>
              </div>

              {/* Address — same street/city/postalCode shape checkout uses,
                  so it can pre-fill straight from this doc. */}
              <div>
                <label className="block text-sm font-semibold mb-2">Delivery Address</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    value={formData.street}
                    onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Street address"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="City / Township"
                  />
                  <input
                    type="text"
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Postal code"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" />
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>

              {/* Logout Button */}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full bg-red-100 text-red-600 py-4 rounded-xl font-bold text-lg hover:bg-red-200 transition-colors flex items-center justify-center gap-2"
              >
                <LogOut className="w-5 h-5" />
                Logout
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
