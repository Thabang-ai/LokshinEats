import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Utensils, Bike, Store, Search } from 'lucide-react';

export const metadata = {
  title: 'About — LokshinEats',
  description: 'Township food delivered. Built to support local restaurants, spaza shops, and home cooks.',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-primary mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Home
        </Link>

        {/* Hero */}
        <div className="text-center mb-12">
          <Image
            src="/logo.png"
            alt="LokshinEats"
            width={120}
            height={120}
            className="mx-auto mb-4 object-contain"
          />
          <h1 className="text-3xl md:text-4xl font-bold mb-2">About LokshinEats</h1>
          <p className="text-lg text-gray-600">Township Food. Delivered.</p>
        </div>

        {/* Mission */}
        <section className="bg-white rounded-2xl shadow-md p-6 md:p-10 mb-8">
          <h2 className="text-2xl font-bold mb-4">Our mission</h2>
          <p className="text-gray-700 mb-3">
            LokshinEats connects townships with the food they love. We give local restaurants,
            spaza shops, and home cooks a simple way to reach customers, and we give customers a
            convenient way to enjoy authentic township flavours without leaving home.
          </p>
          <p className="text-gray-700">
            Every order keeps money in the community — supporting small business owners and
            creating delivery work for drivers in the neighbourhoods we serve.
          </p>
        </section>

        {/* How it works */}
        <section className="bg-white rounded-2xl shadow-md p-6 md:p-10 mb-8">
          <h2 className="text-2xl font-bold mb-6">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Step
              number={1}
              icon={<Search className="w-6 h-6 text-primary" />}
              title="Browse"
              body="Pick a restaurant near you and choose what you're craving."
            />
            <Step
              number={2}
              icon={<Utensils className="w-6 h-6 text-primary" />}
              title="Order & pay"
              body="Checkout with cash on delivery, card, or instant EFT."
            />
            <Step
              number={3}
              icon={<Bike className="w-6 h-6 text-primary" />}
              title="Track & receive"
              body="Watch the kitchen prep, the driver pick up, and your meal arrive — live."
            />
          </div>
        </section>

        {/* Partners CTA */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <PartnerCard
            icon={<Store className="w-7 h-7 text-primary" />}
            title="Run a restaurant?"
            body="Reach more customers in your area. Set your own menu, hours, and delivery fees."
            cta="Become a vendor"
            href="/auth/signup"
          />
          <PartnerCard
            icon={<Bike className="w-7 h-7 text-primary" />}
            title="Want to drive?"
            body="Make money on your own schedule, on a bike or in your car. Bicycle delivery is welcome."
            cta="Become a driver"
            href="/auth/signup"
          />
        </section>

        {/* Contact */}
        <section className="bg-gradient-to-br from-primary to-primary-dark rounded-2xl p-8 text-white text-center">
          <h2 className="text-2xl font-bold mb-3">Get in touch</h2>
          <p className="opacity-90 mb-4">
            Questions, feedback, or partnerships? We'd love to hear from you.
          </p>
          <a
            href="mailto:support@lokshineats.co.za"
            className="inline-block bg-white text-primary px-6 py-3 rounded-xl font-semibold hover:bg-gray-100 transition-colors"
          >
            support@lokshineats.co.za
          </a>
        </section>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------

function Step({
  number,
  icon,
  title,
  body,
}: {
  number: number;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="text-center">
      <div className="w-14 h-14 mx-auto mb-3 bg-primary/10 rounded-full flex items-center justify-center relative">
        {icon}
        <span className="absolute -top-1 -right-1 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">
          {number}
        </span>
      </div>
      <h3 className="font-bold text-lg mb-1">{title}</h3>
      <p className="text-sm text-gray-600">{body}</p>
    </div>
  );
}

function PartnerCard({
  icon,
  title,
  body,
  cta,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-md p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <h3 className="font-bold text-lg">{title}</h3>
      </div>
      <p className="text-gray-600 text-sm mb-4">{body}</p>
      <Link
        href={href}
        className="inline-block bg-primary text-white px-5 py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors text-sm"
      >
        {cta}
      </Link>
    </div>
  );
}
