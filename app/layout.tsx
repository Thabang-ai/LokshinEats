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
  title: "LokshinEats - Township Food Delivery",
  description: "Order food from your favorite township restaurants, spaza shops, and local food businesses",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LokshinEats",
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
