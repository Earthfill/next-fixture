import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us — Get in Touch",
  description:
    "Contact Next Fixture for inquiries about football predictions, partnerships, advertising or press. We respond within 48 hours.",
  openGraph: {
    title: "Contact Next Fixture",
    description:
      "Get in touch with the Next Fixture team. We welcome feedback, partnership inquiries and press requests.",
    url: "/contact",
  },
  twitter: {
    card: "summary",
    title: "Contact Next Fixture",
    description:
      "Get in touch with the Next Fixture team for inquiries about football predictions and partnerships.",
  },
  alternates: {
    canonical: "/contact",
  },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="sm-heading-lg mb-6">Contact Us</h1>
      <p className="text-sm text-zinc-500 mb-6">Send us a message and we&apos;ll get back to you within 48 hours.</p>

      <form className="border border-zinc-200 bg-white p-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-1 block">Name</label>
            <input type="text" required className="w-full border border-zinc-300 px-3 py-2 text-sm" placeholder="Your name" />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-1 block">Email</label>
            <input type="email" required className="w-full border border-zinc-300 px-3 py-2 text-sm" placeholder="you@example.com" />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-1 block">Message</label>
          <textarea rows={5} required className="w-full border border-zinc-300 px-3 py-2 text-sm resize-y" placeholder="How can we help?" />
        </div>
        <button type="submit" className="text-sm font-semibold text-white px-5 py-2" style={{ background: '#002b5c' }}>Send Message</button>
      </form>

      <p className="text-xs text-zinc-400 mt-4">Or email us directly: hello@nextfixture.com</p>
    </div>
  );
}
