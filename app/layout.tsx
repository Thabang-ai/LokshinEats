import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "../layout/Header";
import Footer from "../layout/Footer";
import BottomNav from "../layout/BottomNav";
import { Toaster } from "react-hot-toast";
import { CartProvider } from "../context/CartContext";
import { NotificationProvider } from "../context/NotificationContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#ff6600",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "LokshinEats — Township Food. Delivered.",
  description:
    "Order food from your favourite township restaurants, spaza shops, and local food businesses. Real-time tracking from kitchen to your door.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LokshinEats",
  },
  openGraph: {
    title: "LokshinEats — Township Food. Delivered.",
    description:
      "Order food from your favourite township restaurants, spaza shops, and local food businesses.",
    siteName: "LokshinEats",
    type: "website",
    locale: "en_ZA",
    images: [
      {
        url: "/logo.png",
        width: 1240,
        height: 1240,
        alt: "LokshinEats — Township Food. Delivered.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LokshinEats — Township Food. Delivered.",
    description:
      "Order food from your favourite township restaurants, spaza shops, and local food businesses.",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <NotificationProvider>
          <CartProvider>
            <Header />
            <main className="flex-1 pb-20 lg:pb-0">
              {children}
            </main>
            <Footer />
            <BottomNav />
            <Toaster position="top-center" />
          </CartProvider>
        </NotificationProvider>
      </body>
    </html>
  );
}
