// Renders for any unmatched route. Replaces Next's default bare 404.

import Link from 'next/link';
import { Home, Search, Utensils } from 'lucide-react';

export const metadata = {
  title: 'Page not found — LokshinEats',
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8 text-center">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Utensils className="w-8 h-8 text-primary" />
        </div>

        <p className="text-5xl font-bold text-primary mb-2">404</p>
        <h1 className="text-2xl font-bold mb-2">Page not found</h1>
        <p className="text-gray-600 mb-6">
          The page you're looking for isn't on the menu. It might have moved, been deleted, or
          never existed.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark transition-colors"
          >
            <Home className="w-4 h-4" />
            Go home
          </Link>
          <Link
            href="/restaurants"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
          >
            <Search className="w-4 h-4" />
            Browse restaurants
          </Link>
        </div>
      </div>
    </div>
  );
}
