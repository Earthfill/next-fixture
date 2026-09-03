import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us — Football Predictions & Previews Platform",
  description:
    "Next Fixture is a football analytics platform providing in-depth match previews, score predictions, tactical analysis and statistical breakdowns across Europe's top leagues including Premier League, La Liga, Serie A and Bundesliga.",
  openGraph: {
    title: "About Next Fixture — Football Predictions Platform",
    description:
      "Learn about Next Fixture, the football analytics platform providing expert match previews, score predictions and tactical analysis.",
    url: "/about",
  },
  twitter: {
    card: "summary",
    title: "About Next Fixture",
    description:
      "Football analytics platform providing expert match previews, predictions and analysis.",
  },
  alternates: {
    canonical: "/about",
  },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="sm-heading-lg mb-6">About Next Fixture</h1>
      <div className="sm-body space-y-4 text-sm">
        <p>Next Fixture is a football analytics platform providing in-depth match previews, score predictions, tactical analysis, and statistical breakdowns across Europe&apos;s top leagues.</p>
        <p>Our AI-powered analysis combines football knowledge with data to deliver unique insights. All AI-generated content is clearly labelled.</p>
        <p>Statistical data is sourced from official providers and verified before publication.</p>
        <p>Next Fixture is an independent platform. Affiliate relationships are disclosed. All betting content includes responsible gambling messaging.</p>
      </div>
    </div>
  );
}
