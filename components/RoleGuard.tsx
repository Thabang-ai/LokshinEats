'use client';

// Role Guard Component
// Protects routes based on user role

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import toast from 'react-hot-toast';
import { onAuthStateChanged } from 'firebase/auth';

interface RoleGuardProps {
  allowedRoles: ('customer' | 'vendor' | 'driver')[];
  children: React.ReactNode;
}

export default function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkUserRole = async (user: any) => {
      if (!user) {
        toast.error('Please login first');
        router.push('/auth/login');
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
          toast.error('User profile not found');
          router.push('/auth/signup');
          return;
        }

        const userData = userDoc.data();
        const userRole = userData.role;

        if (!allowedRoles.includes(userRole)) {
          toast.error(`Access denied. This page is for ${allowedRoles.join(' or ')} only.`);
          
          // Redirect based on their actual role
          if (userRole === 'vendor') {
            router.push('/vendor/dashboard');
          } else if (userRole === 'driver') {
            router.push('/driver/dashboard');
          } else {
            router.push('/');
          }
        }
      } catch (error) {
        console.error('Role check error:', error);
        toast.error('Failed to verify user role');
        router.push('/auth/login');
      } finally {
        setIsLoading(false);
      }
    };

    // Use onAuthStateChanged to wait for auth state to be ready
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      checkUserRole(user);
    });

    return () => unsubscribe();
  }, [allowedRoles, router]);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return <>{children}</>;
}
