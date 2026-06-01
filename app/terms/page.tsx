// Terms of Service — placeholder content. Replace with real legal text
// reviewed by a qualified attorney before processing real payments or
// handling real customer data at scale.

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Terms of Service — LokshinEats',
  description: 'Terms of service for using LokshinEats.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Home
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: 27 May 2026</p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8 text-sm text-amber-800">
          <p className="font-semibold mb-1">⚠️ Placeholder text</p>
          <p>
            These terms are a starting draft and are not legal advice. Before launching publicly, have
            them reviewed by a qualified South African attorney.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-6 md:p-10 space-y-8 text-gray-700">
          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">1. Acceptance of these terms</h2>
            <p>
              By creating an account, placing an order, or otherwise using LokshinEats (the
              "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not
              agree, please don't use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">2. Your account</h2>
            <p className="mb-3">
              You must provide accurate information when registering and keep it up to date. You
              are responsible for keeping your login credentials secure and for all activity that
              happens through your account.
            </p>
            <p>
              You must be at least 18 years old, or have permission from a parent or legal
              guardian, to use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">3. Placing and receiving orders</h2>
            <p className="mb-3">
              Restaurants set their own prices, menus, opening hours, and minimum order amounts.
              We display this information as provided by them but do not guarantee its accuracy.
            </p>
            <p>
              Once a restaurant accepts your order, payment is due. You can pay by cash on
              delivery, card via Yoco, or instant EFT via Ozow.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">4. Delivery</h2>
            <p>
              Deliveries are carried out by independent drivers. Estimated delivery times are
              estimates only — actual delivery times depend on traffic, restaurant prep time, and
              other factors. We are not liable for delays caused by factors outside our reasonable
              control.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">5. Cancellations and refunds</h2>
            <p>
              You may cancel an order before the restaurant accepts it without charge. Once
              accepted, cancellation may not be possible. If your order arrives incorrect or
              significantly delayed, contact the restaurant first; if unresolved, contact
              LokshinEats support.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">6. Restaurants and drivers</h2>
            <p>
              Restaurants and drivers using LokshinEats are independent businesses, not employees
              of LokshinEats. We facilitate the marketplace; we don't prepare food or operate
              vehicles.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">7. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by South African law, LokshinEats is not liable for
              indirect, incidental, or consequential damages arising from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">8. Changes to these terms</h2>
            <p>
              We may update these Terms from time to time. Continued use of the Service after
              changes means you accept the new Terms. We'll do our best to highlight significant
              changes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">9. Contact</h2>
            <p>
              Questions about these Terms? Reach us at{' '}
              <a href="mailto:support@lokshineats.co.za" className="text-primary hover:underline">
                support@lokshineats.co.za
              </a>
              .
            </p>
          </section>
        </div>

        <p className="text-sm text-gray-500 mt-8 text-center">
          See also our{' '}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
