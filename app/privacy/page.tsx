// Privacy Policy — fuller working draft aligned with South Africa's POPIA
// (Protection of Personal Information Act 4 of 2013). Still not legal
// advice — have this reviewed by a qualified attorney before public launch.

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
        <p className="text-sm text-gray-500 mb-8">Last updated: 26 August 2026</p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8 text-sm text-amber-800">
          <p className="font-semibold mb-1">⚠️ Working draft — not legal advice</p>
          <p>
            This is a fuller draft aligned with South Africa&apos;s POPIA, but it has not been
            reviewed by a qualified attorney. Review it with one — ideally with POPIA experience —
            before relying on it for a public launch.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-6 md:p-10 space-y-8 text-gray-700">
          <section>
            <p>
              LokshinEats (&quot;LokshinEats&quot;, &quot;we&quot;, &quot;us&quot;) respects your
              privacy and is committed to protecting personal information in line with the
              Protection of Personal Information Act 4 of 2013 (&quot;POPIA&quot;). This Policy
              explains what we collect, why, and what rights you have.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">Who we are</h2>
            <p>
              LokshinEats is the &quot;Responsible Party&quot; for personal information processed
              through the app. Our Information Officer — the person accountable for privacy
              matters and POPIA compliance — is Thabang Molefe, Founder, contactable at{' '}
              <a href="mailto:support@lokshineats.co.za" className="text-primary hover:underline">
                support@lokshineats.co.za
              </a>
              .
            </p>
          </section>

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
                <strong>Location information</strong> — your delivery city/area, used to estimate
                delivery distance and match your order to a driver whose vehicle can realistically
                cover that distance.
              </li>
              <li>
                <strong>Payment information</strong> — handled by our payment processors (Yoco or
                Ozow) once live, or noted as cash on delivery; we don&apos;t store full card
                numbers.
              </li>
              <li>
                <strong>Device & usage information</strong> — basic technical info like browser
                type and IP address, for security and improving the Service.
              </li>
              <li>
                <strong>For vendors</strong> — business address, business registration and proof of
                address documents, and banking details (for payouts).
              </li>
              <li>
                <strong>For drivers</strong> — ID number, vehicle type and registration, driver&apos;s
                license, and banking details. Bicycle drivers are not asked for a license or
                vehicle registration.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">Why we collect it</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To process, prepare, and deliver your orders — necessary to fulfil our contract with you.</li>
              <li>To verify vendor and driver identity and documents — necessary to fulfil our contract, and in the interest of platform safety.</li>
              <li>To pay drivers and reconcile vendor payouts — necessary to fulfil our contract.</li>
              <li>To let vendors and drivers contact you about your order.</li>
              <li>To send transactional notifications (order status updates).</li>
              <li>To respond to support queries and complaints.</li>
              <li>To improve the Service and prevent fraud.</li>
              <li>To comply with legal and tax obligations.</li>
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
              <li>Service providers (Firebase / Google Cloud) for hosting, authentication, and storage.</li>
              <li>Authorities, when required by law.</li>
            </ul>
            <p className="mt-3">We don&apos;t sell your personal information to third parties.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">Cross-border storage</h2>
            <p>
              Our infrastructure provider (Firebase / Google Cloud) may store and process
              information on servers located outside South Africa. Where this happens, we rely on
              that provider&apos;s contractual and security safeguards to keep your information
              protected to a standard consistent with POPIA, as required by section 72 of the Act.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">How long we keep it</h2>
            <p>
              We keep personal information for as long as necessary to provide the Service, meet
              legal and tax record-keeping requirements, and resolve any disputes, after which it
              is deleted or anonymised.
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
            <h2 className="text-xl font-bold mb-3 text-gray-900">Cookies & local storage</h2>
            <p>
              The app uses your browser&apos;s local storage to remember things like your cart
              contents between visits. We don&apos;t currently use third-party advertising
              trackers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">Your rights</h2>
            <p className="mb-3">Under POPIA, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access the personal information we hold about you.</li>
              <li>Correct it if it&apos;s wrong.</li>
              <li>Have it deleted (subject to legal/operational retention requirements).</li>
              <li>Object to certain processing.</li>
              <li>
                Lodge a complaint with the{' '}
                <a
                  href="https://inforegulator.org.za"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Information Regulator of South Africa
                </a>{' '}
                if you believe your information has been mishandled.
              </li>
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
            <h2 className="text-xl font-bold mb-3 text-gray-900">Children</h2>
            <p>
              LokshinEats isn&apos;t directed at children under 18. We don&apos;t knowingly collect
              personal information from children. If you believe we have, contact us and we&apos;ll
              delete it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3 text-gray-900">Changes</h2>
            <p>
              We may update this Privacy Policy from time to time. We&apos;ll do our best to notify
              you of significant changes via email or an in-app notice.
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
