import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Header from "@/components/common/Header";
import Footer from "@/components/common/Footer";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://next-fixture.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Next Fixture — Football Predictions, Previews & Betting Tips",
    template: "%s | Next Fixture",
  },
  description:
    "In-depth football match previews, score predictions, betting tips, tactical analysis, head-to-head statistics and odds for the Premier League, La Liga, Serie A and Bundesliga. Expert football analysis daily.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: "Next Fixture",
    title: "Next Fixture — Football Predictions, Previews & Betting Tips",
    description:
      "In-depth football match previews with score predictions, betting tips, tactical analysis and odds. Expert coverage of Premier League, La Liga, Serie A & Bundesliga.",
    url: SITE_URL,
    images: [{ url: "/logo-small.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Next Fixture — Football Predictions, Previews & Betting Tips",
    description:
      "In-depth football match previews with score predictions, betting tips, tactical analysis and odds.",
    images: ["/logo-small.png"],
  },
  icons: {
    icon: "/logo-small.svg",
    shortcut: "/logo-small.svg",
  },
  verification: {
    google: "YOUR_GOOGLE_VERIFICATION_CODE", // Replace with your actual Google Search Console verification code
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.className}>
      <body className="min-h-screen flex flex-col bg-white text-[#1a1a1a]">
        <Analytics />
        <Header />
        <main className="flex-1 w-full">{children}</main>
        <Footer />

        {/* Google AdSense script slot */}
        <Script
          id="adsbygoogle-init"
          strategy="afterInteractive"
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX"
          crossOrigin="anonymous"
        />
      </body>
    </html>
  );
}
