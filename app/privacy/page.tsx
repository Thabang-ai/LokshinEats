// Privacy Policy — placeholder content. Replace with real privacy notice
// reviewed by an attorney before launch. South Africa's POPIA (Protection of
// Personal Information Act) requires specific disclosures.

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy — LokshinEats',
  description: 'How LokshinEats collects, uses, and protects your information.',
};

export default function PrivacyPage() {
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

        <h1 className="text-3xl md:text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: 27 May 2026</p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8 text-sm text-amber-800">
          <p className="font-semibold mb-1">⚠️ Placeholder text</p>
          <p>
            This privacy notice is a starting draft and is not legal advice. South Africa's
            POPIA has specific requirements — review with a qualified attorney before launch.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-6 md:p-10 space-y-8 text-gray-700">
          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">What we collect</h2>
            <p className="mb-3">When you use LokshinEats, we collect:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong>Account information</strong> — your name, email, phone number, and role
                (customer, vendor, or driver).
              </li>
              <li>
                <strong>Order information</strong> — what you ordered, when, from whom, and where
                it was delivered.
              </li>
              <li>
                <strong>Payment information</strong> — handled by our payment processors (Yoco or
                Ozow); we don't store full card numbers.
              </li>
              <li>
                <strong>Device & usage information</strong> — basic technical info like browser
                type and IP address, for security and improving the Service.
              </li>
              <li>
                <strong>For vendors</strong> — business address, banking details (for payouts).
              </li>
              <li>
                <strong>For drivers</strong> — ID number, vehicle registration, driver's license,
                banking details. Bicycle drivers are not asked for license or registration.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">How we use it</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To process and deliver your orders.</li>
              <li>To let vendors and drivers contact you about your order.</li>
              <li>To send transactional notifications (order status updates).</li>
              <li>To improve the Service and prevent fraud.</li>
              <li>To comply with legal obligations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">Who we share it with</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>The vendor fulfilling your order (your name, items, delivery address).</li>
              <li>The driver delivering your order (your name, phone, delivery address).</li>
              <li>
                Payment processors (Yoco, Ozow) for processing payments — they have their own
                privacy policies.
              </li>
              <li>Service providers (Firebase / Google Cloud) for hosting and storage.</li>
              <li>Authorities when required by law.</li>
            </ul>
            <p className="mt-3">
              We don't sell your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">Your rights</h2>
            <p className="mb-3">Under POPIA, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access the personal information we hold about you.</li>
              <li>Correct it if it's wrong.</li>
              <li>Have it deleted (subject to legal/operational retention requirements).</li>
              <li>Object to certain processing.</li>
            </ul>
            <p className="mt-3">
              To exercise these rights, email{' '}
              <a href="mailto:support@lokshineats.co.za" className="text-primary hover:underline">
                support@lokshineats.co.za
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">Data security</h2>
            <p>
              We use industry-standard measures to protect your information, including encryption
              in transit. No system is perfectly secure — if you suspect your account has been
              compromised, change your password and contact us immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">Children</h2>
            <p>
              LokshinEats isn't directed at children under 18. We don't knowingly collect personal
              information from children. If you believe we have, contact us and we'll delete it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">Changes</h2>
            <p>
              We may update this Privacy Policy from time to time. We'll do our best to notify you
              of significant changes via email or an in-app notice.
            </p>
          </section>
        </div>

        <p className="text-sm text-gray-500 mt-8 text-center">
          See also our{' '}
          <Link href="/terms" className="text-primary hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
