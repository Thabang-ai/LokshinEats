// Footer component for LokshinEats
// This appears at the bottom of the page (hidden on mobile where bottom nav is used)

export default function Footer() {
  return (
    <footer className="bg-black text-white py-12 hidden lg:block">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand section */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-xl">K</span>
              </div>
              <h2 className="text-2xl font-bold">
                Kasi<span className="text-primary">Eats</span>
              </h2>
            </div>
            <p className="text-gray-400">
              Bringing township flavors to your doorstep. Support local businesses, enjoy great food.
            </p>
          </div>

          {/* Quick links */}
          <div>
            <h3 className="font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-gray-400">
              <li><a href="#" className="hover:text-primary transition-colors">About Us</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">How It Works</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Become a Driver</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Partner With Us</a></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold mb-4">Support</h3>
            <ul className="space-y-2 text-gray-400">
              <li><a href="#" className="hover:text-primary transition-colors">Help Center</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Contact Us</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">FAQ</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Terms of Service</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold mb-4">Contact</h3>
            <ul className="space-y-2 text-gray-400">
              <li>Email: support@kasieats.co.za</li>
              <li>Phone: +27 11 123 4567</li>
              <li>Based in South Africa</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
          <p>&copy; 2024 LokshinEats. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
