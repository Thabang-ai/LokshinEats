'use client';

// Role Guard Component
// Protects routes based on user role.
//
// Fails closed: children render only once this has read the signed-in user's
// role and found it in `allowedRoles`. Anything else — no session, no profile
// document, a failed read, a role that is not allowed — renders nothing and
// sends them somewhere they may be.
//
// It had been the other way round: a missing profile or a failed read let the
// page through, and a disallowed role started a redirect but drew the page
// anyway. That is how a customer account could open /admin. The API refuses
// the data regardless — it checks the role in the caller's token, and this
// component cannot grant anything — but a console that opens for the wrong
// person and then fills with permission errors is its own kind of wrong.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import toast from 'react-hot-toast';
import { onAuthStateChanged, type User } from 'firebase/auth';

type Role = 'customer' | 'vendor' | 'driver' | 'admin';

interface RoleGuardProps {
  allowedRoles: Role[];
  children: React.ReactNode;
}

/** Where a role belongs when it may not be here. */
const HOME_FOR: Record<Role, string> = {
  admin: '/admin',
  vendor: '/vendor/dashboard',
  driver: '/driver/dashboard',
  customer: '/',
};

export default function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied'>(
    'checking',
  );

  // Callers pass a literal (`allowedRoles={['admin']}`), which is a new array
  // on every render. Depending on its contents rather than its identity keeps
  // this from re-subscribing and re-reading the profile each time.
  const rolesKey = allowedRoles.join(',');

  useEffect(() => {
    const allowed = rolesKey.split(',') as Role[];
    let cancelled = false;

    const checkUserRole = async (user: User | null) => {
      if (!user) {
        if (cancelled) return;
        setStatus('denied');
        toast.error('Please login first');
        router.push('/auth/login');
        return;
      }

      let role: Role;
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        // Signed in with no profile yet: the least privileged role, not a
        // free pass. Someone part-way through signing up is a customer.
        role = ((userDoc.data()?.role as Role | undefined) ?? 'customer');
      } catch (error) {
        // An unreadable role is not an allowed one.
        console.error('Role check error:', error);
        if (cancelled) return;
        setStatus('denied');
        toast.error('Could not confirm your access. Please sign in again.');
        router.push('/auth/login');
        return;
      }

      if (cancelled) return;

      if (!allowed.includes(role)) {
        setStatus('denied');
        toast.error(
          `Access denied. This page is for ${allowed.join(' or ')} only.`,
        );
        router.push(HOME_FOR[role] ?? '/');
        return;
      }

      setStatus('allowed');
    };

    // onAuthStateChanged, so the check waits for Firebase to restore the
    // session rather than deciding against a null user on first paint.
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      void checkUserRole(user);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [rolesKey, router]);

  if (status === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading...
      </div>
    );
  }

  // Denied renders nothing: the redirect is on its way, and whatever this
  // page would have shown is not for them.
  if (status === 'denied') return null;

  return <>{children}</>;
}
