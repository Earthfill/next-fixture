import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";
import Header from "@/components/common/Header";
import Footer from "@/components/common/Footer";
import CookieConsentBanner from "@/components/common/CookieConsentBanner";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL as string;

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
    images: [{ url: `${SITE_URL}/og-default.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Next Fixture — Football Predictions, Previews & Betting Tips",
    description:
      "In-depth football match previews with score predictions, betting tips, tactical analysis and odds.",
    images: [`${SITE_URL}/og-default.png`],
  },
  icons: {
    // Declare a single crisp favicon (512x512 PNG) with an explicit type/sizes.
    // Per Yandex favicon docs, when multiple <link rel="icon"> exist the robot
    // may pick ANY one — declaring the tiny 16x16 favicon.ico too gives it the
    // chance to select a blurry icon. /favicon.ico still exists at the root for
    // legacy bots that probe it directly, we just don't advertise it.
    icon: [{ url: "/icon.png", type: "image/png", sizes: "512x512" }],
    apple: "/apple-icon.png",
  },
  other: {
    // Google AdSense site ownership verification (renders as a <meta> tag in <head>)
    "google-adsense-account": "ca-pub-3188740496800409",
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
        <NextTopLoader
          color="#002b5c"
          height={3}
          showSpinner={false}
          shadow="0 0 10px #002b5c,0 0 5px #002b5c"
        />
        <Analytics />
        <Header />
        <main className="flex-1 w-full">{children}</main>
        <Footer />
        <CookieConsentBanner />

        {/* Google AdSense script slot */}
        <Script
          id="adsbygoogle-init"
          strategy="afterInteractive"
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3188740496800409"
          crossOrigin="anonymous"
        />
      </body>
    </html>
  );
}
