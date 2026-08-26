// Terms of Service — fuller working draft. Still not legal advice — review
// with a qualified South African attorney (Consumer Protection Act
// considerations in particular) before processing real payments or
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
        <p className="text-sm text-gray-500 mb-8">Last updated: 26 August 2026</p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8 text-sm text-amber-800">
          <p className="font-semibold mb-1">⚠️ Working draft — not legal advice</p>
          <p>
            This is a fuller draft, written in plain language consistent with the Consumer
            Protection Act 68 of 2008, but it has not been reviewed by a qualified attorney.
            Review it before launching publicly.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-6 md:p-10 space-y-8 text-gray-700">
          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">1. What LokshinEats is</h2>
            <p>
              LokshinEats is a platform that connects customers with independent local food and
              grocery vendors (&quot;Vendors&quot;) and independent delivery partners
              (&quot;Drivers&quot;) in South African townships. LokshinEats does not prepare, own,
              or sell the food or items listed on the platform — Vendors do. Deliveries are carried
              out by Drivers under separate contract with LokshinEats, not LokshinEats employees.
              By creating an account, placing an order, or otherwise using LokshinEats (the
              &quot;Service&quot;), you agree to be bound by these Terms of Service
              (&quot;Terms&quot;). If you do not agree, please don&apos;t use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">2. Your account</h2>
            <p className="mb-3">
              You must provide accurate information when registering and keep it up to date. You
              are responsible for keeping your login credentials secure and for all activity that
              happens through your account.
            </p>
            <p>You must be at least 18 years old to create a LokshinEats account.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">3. Placing and receiving orders</h2>
            <p className="mb-3">
              Vendors set their own prices, menus, opening hours, and minimum order amounts. Prices,
              the delivery fee, and the minimum order amount are shown in the app at checkout before
              you confirm an order. We display this information as provided by Vendors but do not
              guarantee its accuracy.
            </p>
            <p>
              Placing an order is an offer to buy, which the Vendor may accept or decline (for
              example, if an item is unexpectedly unavailable). Once a Vendor confirms your order,
              payment is due — by cash on delivery, or by card via Yoco or instant EFT via Ozow once
              those payment methods are live on the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">4. Delivery</h2>
            <p>
              Deliveries are carried out by independent LokshinEats delivery partners, not
              employees. Estimated delivery times are estimates only — actual delivery times depend
              on traffic, vendor prep time, weather, and other factors outside our reasonable
              control.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">5. Cancellations and refunds</h2>
            <p>
              You may cancel an order before the Vendor confirms it, free of charge. Once confirmed
              and preparation has begun, cancellation may not be possible, and a refund is not
              guaranteed. If your order arrives incorrect, incomplete, or significantly delayed,
              contact us within 24 hours with details — refund or credit decisions are made case by
              case, taking into account the Consumer Protection Act 68 of 2008, and typically
              involve the responsible Vendor.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">6. Vendors and Drivers</h2>
            <p>
              Vendors and Drivers using LokshinEats are independent businesses and independent
              contractors, not employees of LokshinEats. Vendors are responsible for the quality,
              safety, accuracy, and legality of the food and items they prepare, including
              compliance with applicable food safety law. We facilitate the marketplace and
              delivery logistics; we don&apos;t prepare food or operate vehicles ourselves.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">7. Acceptable use</h2>
            <p>
              You agree not to place fraudulent orders, abuse, threaten, or harass Vendors or
              Drivers, misuse promotional offers, or attempt to interfere with the proper
              functioning of the app.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">8. Intellectual property</h2>
            <p>
              The LokshinEats name, logo, and app content belong to LokshinEats and may not be used
              without permission, other than as needed to use the app in the ordinary way.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">9. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by the Consumer Protection Act 68 of 2008 and other
              applicable South African law, LokshinEats&apos; liability for any claim relating to
              your use of the Service is limited to the value of the relevant order. Nothing in
              these Terms limits any right you have under the Consumer Protection Act that cannot
              lawfully be excluded.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">10. Changes to these terms</h2>
            <p>
              We may update these Terms from time to time. Continued use of the Service after
              changes means you accept the new Terms. We&apos;ll do our best to highlight
              significant changes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">11. Governing law</h2>
            <p>These Terms are governed by the laws of the Republic of South Africa.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">12. Contact</h2>
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
