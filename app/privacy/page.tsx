import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Responsible Gambling & Data Protection",
  description:
    "Privacy policy and legal disclaimers for Next Fixture. Information about cookies, affiliate disclosure and responsible gambling commitments. All betting content is for adults aged 18+.",
  openGraph: {
    title: "Privacy Policy | Next Fixture",
    description:
      "Privacy policy, cookie information, affiliate disclosure and responsible gambling commitments.",
    url: "/privacy",
  },
  twitter: {
    card: "summary",
    title: "Privacy Policy | Next Fixture",
    description:
      "Privacy policy, cookie information and responsible gambling commitments.",
  },
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="sm-heading-lg mb-2">Privacy Policy</h1>
      <p className="text-xs text-zinc-400 mb-6">Last updated: 2026-01-01</p>

      <div className="sm-body space-y-6 text-sm">
        <section>
          <h2 className="text-sm font-bold text-zinc-800 mb-2">1. Overview</h2>
          <p>Next Fixture respects your privacy. This policy explains how we handle information when you visit our website, including data collected through analytics, advertising, and affiliate services.</p>
        </section>
        <section>
          <h2 className="text-sm font-bold text-zinc-800 mb-2">2. Cookies</h2>
          <p>We use cookies for essential functionality, analytics (Google Analytics), advertising (Google AdSense), and affiliate tracking. You can opt out of personalised advertising at Google Ads Settings.</p>
        </section>
        <section>
          <h2 className="text-sm font-bold text-zinc-800 mb-2">3. Affiliate Disclosure</h2>
          <p>We participate in affiliate programmes. If you click through and sign up with a partner, we may earn a commission at no extra cost to you.</p>
        </section>
        <section>
          <h2 className="text-sm font-bold text-zinc-800 mb-2">4. Responsible Gambling</h2>
          <p>All betting content is for adults aged 18+. If you need help with problem gambling, visit BeGambleAware.org or call 0808 8020 133 (UK).</p>
        </section>
      </div>
    </div>
  );
}
