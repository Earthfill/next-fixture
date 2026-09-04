import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Shield, Cookie, Users, AlertTriangle, HelpCircle, Mail, ExternalLink } from "lucide-react";

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
  const lastUpdated = "January 1, 2026";

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="sm-heading-lg mb-3">Privacy Policy</h1>
        <p className="text-sm text-zinc-500 mb-4">
          Last updated: {lastUpdated}
        </p>
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800 flex items-start gap-2">
            <Shield className="h-5 w-5 shrink-0 mt-0.5" />
            <span>
              Your privacy is important to us. This policy explains what information we collect, 
              how we use it, and the choices you have regarding your data when using Next Fixture.
            </span>
          </p>
        </div>
      </div>

      {/* Table of Contents */}
      <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 mb-8">
        <h2 className="text-sm font-bold text-zinc-800 mb-3">Contents</h2>
        <nav className="space-y-2">
          {[
            "Introduction",
            "Information We Collect",
            "How We Use Your Information",
            "Cookies and Tracking Technologies",
            "Third-Party Services",
            "Affiliate Disclosure",
            "Advertising",
            "Responsible Gambling",
            "Your Rights and Choices",
            "Data Security",
            "Children's Privacy",
            "International Data Transfers",
            "Changes to This Policy",
            "Contact Us"
          ].map((section, index) => (
            <a
              key={index}
              href={`#section-${index + 1}`}
              className="block text-sm text-zinc-600 hover:text-[#002b5c] transition-colors"
            >
              {index + 1}. {section}
            </a>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="space-y-8">
        {/* 1. Introduction */}
        <section id="section-1" className="border-b border-zinc-100 pb-6">
          <h2 className="text-lg font-bold text-zinc-800 mb-3 flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#002b5c]" />
            1. Introduction
          </h2>
          <p className="text-sm text-zinc-600 leading-relaxed mb-3">
            Next Fixture ("we," "our," or "us") is committed to protecting your privacy. 
            This Privacy Policy explains how we collect, use, disclose, and safeguard your 
            information when you visit our website, including any other media form, media 
            channel, mobile website, or mobile application related or connected thereto.
          </p>
          <p className="text-sm text-zinc-600 leading-relaxed mb-3">
            Please read this privacy policy carefully. If you do not agree with the terms 
            of this privacy policy, please do not access the site. By using our website, 
            you consent to the data practices described in this policy.
          </p>
        </section>

        {/* 2. Information We Collect */}
        <section id="section-2" className="border-b border-zinc-100 pb-6">
          <h2 className="text-lg font-bold text-zinc-800 mb-3 flex items-center gap-2">
            <Users className="h-5 w-5 text-[#002b5c]" />
            2. Information We Collect
          </h2>
          <p className="text-sm text-zinc-600 leading-relaxed mb-3">
            We collect information that you provide directly to us and information that is 
            automatically collected when you access our website.
          </p>
          
          <h3 className="text-sm font-semibold text-zinc-700 mb-2">Information You Provide:</h3>
          <ul className="list-disc list-inside text-sm text-zinc-600 space-y-1 mb-4 pl-4">
            <li>Contact information (if you email us or use contact forms)</li>
            <li>Feedback and correspondence</li>
            <li>Any other information you choose to provide</li>
          </ul>

          <h3 className="text-sm font-semibold text-zinc-700 mb-2">Information Automatically Collected:</h3>
          <ul className="list-disc list-inside text-sm text-zinc-600 space-y-1 mb-4 pl-4">
            <li>Device information (browser type, operating system, device type)</li>
            <li>Usage data (pages visited, time spent, navigation patterns)</li>
            <li>IP address and general location data</li>
            <li>Referring website or source</li>
            <li>Cookie and tracking technology data</li>
          </ul>
        </section>

        {/* 3. How We Use Your Information */}
        <section id="section-3" className="border-b border-zinc-100 pb-6">
          <h2 className="text-lg font-bold text-zinc-800 mb-3">
            3. How We Use Your Information
          </h2>
          <p className="text-sm text-zinc-600 leading-relaxed mb-3">
            We use the information we collect for various purposes, including:
          </p>
          <ul className="list-disc list-inside text-sm text-zinc-600 space-y-1 pl-4">
            <li>Providing, maintaining, and improving our website and services</li>
            <li>Understanding how users interact with our content</li>
            <li>Personalizing your experience and delivering relevant content</li>
            <li>Analyzing usage patterns and trends</li>
            <li>Detecting, preventing, and addressing technical issues</li>
            <li>Complying with legal obligations</li>
          </ul>
        </section>

        {/* 4. Cookies and Tracking Technologies */}
        <section id="section-4" className="border-b border-zinc-100 pb-6">
          <h2 className="text-lg font-bold text-zinc-800 mb-3 flex items-center gap-2">
            <Cookie className="h-5 w-5 text-[#002b5c]" />
            4. Cookies and Tracking Technologies
          </h2>
          <p className="text-sm text-zinc-600 leading-relaxed mb-3">
            We use cookies and similar tracking technologies to track activity on our website 
            and store certain information. Cookies are files with a small amount of data that 
            are commonly used as anonymous unique identifiers.
          </p>
          
          <h3 className="text-sm font-semibold text-zinc-700 mb-2">Types of Cookies We Use:</h3>
          <div className="space-y-3 mb-4">
            <div className="bg-zinc-50 p-3 rounded">
              <h4 className="text-sm font-medium text-zinc-700 mb-1">Essential Cookies</h4>
              <p className="text-xs text-zinc-600">
                Required for basic website functionality, such as remembering your cookie 
                preferences and maintaining session security.
              </p>
            </div>
            <div className="bg-zinc-50 p-3 rounded">
              <h4 className="text-sm font-medium text-zinc-700 mb-1">Analytics Cookies</h4>
              <p className="text-xs text-zinc-600">
                Help us understand how visitors interact with our website by collecting 
                anonymous information about page visits, time spent, and navigation patterns 
                (e.g., Google Analytics).
              </p>
            </div>
            <div className="bg-zinc-50 p-3 rounded">
              <h4 className="text-sm font-medium text-zinc-700 mb-1">Advertising Cookies</h4>
              <p className="text-xs text-zinc-600">
                Used to deliver relevant advertisements and measure campaign effectiveness 
                (e.g., Google AdSense).
              </p>
            </div>
            <div className="bg-zinc-50 p-3 rounded">
              <h4 className="text-sm font-medium text-zinc-700 mb-1">Affiliate Tracking Cookies</h4>
              <p className="text-xs text-zinc-600">
                Enable us to track referrals to partner sites and attribute commissions 
                appropriately.
              </p>
            </div>
          </div>

          <p className="text-sm text-zinc-600 leading-relaxed">
            You can control cookies through your browser settings. However, disabling 
            certain cookies may affect website functionality. You can also opt out of 
            personalized advertising through{" "}
            <a 
              href="https://adssettings.google.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[#002b5c] hover:underline"
            >
              Google Ads Settings
            </a>.
          </p>
        </section>

        {/* 5. Third-Party Services */}
        <section id="section-5" className="border-b border-zinc-100 pb-6">
          <h2 className="text-lg font-bold text-zinc-800 mb-3">
            5. Third-Party Services
          </h2>
          <p className="text-sm text-zinc-600 leading-relaxed mb-3">
            We use third-party services that may collect information used to identify you. 
            These services have their own privacy policies governing the use of your data.
          </p>
          
          <h3 className="text-sm font-semibold text-zinc-700 mb-2">Third-Party Services We Use:</h3>
          <ul className="space-y-2 mb-4">
            <li className="text-sm text-zinc-600">
              <strong className="text-zinc-700">Google Analytics</strong> — Website analytics. 
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[#002b5c] hover:underline ml-1">
                Privacy Policy <ExternalLink className="h-3 w-3 inline" />
              </a>
            </li>
            <li className="text-sm text-zinc-600">
              <strong className="text-zinc-700">Google AdSense</strong> — Advertising. 
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[#002b5c] hover:underline ml-1">
                Privacy Policy <ExternalLink className="h-3 w-3 inline" />
              </a>
            </li>
            <li className="text-sm text-zinc-600">
              <strong className="text-zinc-700">The Guardian API</strong> — News content. 
              <a href="https://www.theguardian.com/help/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-[#002b5c] hover:underline ml-1">
                Privacy Policy <ExternalLink className="h-3 w-3 inline" />
              </a>
            </li>
          </ul>
        </section>

        {/* 6. Affiliate Disclosure */}
        <section id="section-6" className="border-b border-zinc-100 pb-6">
          <h2 className="text-lg font-bold text-zinc-800 mb-3">
            6. Affiliate Disclosure
          </h2>
          <p className="text-sm text-zinc-600 leading-relaxed mb-3">
            Next Fixture participates in various affiliate marketing programs. This means 
            that when you click on certain links and make a purchase or sign up for a 
            service, we may receive a commission at no additional cost to you.
          </p>
          <p className="text-sm text-zinc-600 leading-relaxed mb-3">
            This compensation helps us maintain and improve our website, and it does not 
            influence our content or recommendations. We only promote products and services 
            that we believe provide value to our users.
          </p>
          <p className="text-sm text-zinc-600 leading-relaxed">
            All affiliate relationships are disclosed in accordance with advertising 
            guidelines and regulations.
          </p>
        </section>

        {/* 7. Advertising */}
        <section id="section-7" className="border-b border-zinc-100 pb-6">
          <h2 className="text-lg font-bold text-zinc-800 mb-3">
            7. Advertising
          </h2>
          <p className="text-sm text-zinc-600 leading-relaxed mb-3">
            We display advertisements on our website through third-party advertising 
            networks, primarily Google AdSense. These networks may use cookies and web 
            beacons to collect information about your visits to this and other websites 
            to provide targeted advertising.
          </p>
          <p className="text-sm text-zinc-600 leading-relaxed">
            You can opt out of personalized advertising by visiting{" "}
            <a 
              href="https://www.aboutads.info/choices" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[#002b5c] hover:underline"
            >
              About Ads
            </a>{" "}
            or{" "}
            <a 
              href="https://www.youronlinechoices.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[#002b5c] hover:underline"
            >
              Your Online Choices
            </a>.
          </p>
        </section>

        {/* 8. Responsible Gambling */}
        <section id="section-8" className="border-b border-zinc-100 pb-6">
          <h2 className="text-lg font-bold text-zinc-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[#002b5c]" />
            8. Responsible Gambling
          </h2>
          <p className="text-sm text-zinc-600 leading-relaxed mb-3">
            All betting and gambling content on Next Fixture is intended for adults aged 
            18 and over. Gambling involves risk, and you should only gamble with money 
            you can afford to lose.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-zinc-800 mb-2">Help and Support:</h3>
            <ul className="space-y-2 text-sm text-zinc-600">
              <li>
                <strong>BeGambleAware:</strong>{" "}
                <a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer" className="text-[#002b5c] hover:underline">
                  www.begambleaware.org
                </a>{" "}
                or call 0808 8020 133 (UK)
              </li>
              <li>
                <strong>GamCare:</strong>{" "}
                <a href="https://www.gamcare.org.uk" target="_blank" rel="noopener noreferrer" className="text-[#002b5c] hover:underline">
                  www.gamcare.org.uk
                </a>{" "}
                or call 0808 8020 133
              </li>
              <li>
                <strong>Gamblers Anonymous:</strong>{" "}
                <a href="https://www.gamblersanonymous.org.uk" target="_blank" rel="noopener noreferrer" className="text-[#002b5c] hover:underline">
                  www.gamblersanonymous.org.uk
                </a>
              </li>
            </ul>
          </div>
        </section>

        {/* 9. Your Rights and Choices */}
        <section id="section-9" className="border-b border-zinc-100 pb-6">
          <h2 className="text-lg font-bold text-zinc-800 mb-3">
            9. Your Rights and Choices
          </h2>
          <p className="text-sm text-zinc-600 leading-relaxed mb-3">
            Depending on your location, you may have certain rights regarding your personal 
            information, including:
          </p>
          <ul className="list-disc list-inside text-sm text-zinc-600 space-y-1 mb-4 pl-4">
            <li>The right to access your personal data</li>
            <li>The right to rectification of inaccurate data</li>
            <li>The right to erasure (right to be forgotten)</li>
            <li>The right to restrict processing</li>
            <li>The right to data portability</li>
            <li>The right to object to processing</li>
            <li>The right to withdraw consent</li>
          </ul>
          <p className="text-sm text-zinc-600 leading-relaxed">
            To exercise any of these rights, please contact us using the information 
            provided in the Contact Us section below.
          </p>
        </section>

        {/* 10. Data Security */}
        <section id="section-10" className="border-b border-zinc-100 pb-6">
          <h2 className="text-lg font-bold text-zinc-800 mb-3">
            10. Data Security
          </h2>
          <p className="text-sm text-zinc-600 leading-relaxed">
            We implement appropriate technical and organizational security measures to 
            protect your personal information from unauthorized access, disclosure, 
            alteration, or destruction. However, no method of transmission over the 
            internet or electronic storage is 100% secure, and we cannot guarantee 
            absolute security.
          </p>
        </section>

        {/* 11. Children's Privacy */}
        <section id="section-11" className="border-b border-zinc-100 pb-6">
          <h2 className="text-lg font-bold text-zinc-800 mb-3">
            11. Children's Privacy
          </h2>
          <p className="text-sm text-zinc-600 leading-relaxed">
            Our website is not intended for individuals under the age of 18. We do not 
            knowingly collect personal information from children. If you are a parent or 
            guardian and believe your child has provided us with personal information, 
            please contact us, and we will take steps to delete such information.
          </p>
        </section>

        {/* 12. International Data Transfers */}
        <section id="section-12" className="border-b border-zinc-100 pb-6">
          <h2 className="text-lg font-bold text-zinc-800 mb-3">
            12. International Data Transfers
          </h2>
          <p className="text-sm text-zinc-600 leading-relaxed">
            Your information may be transferred to and maintained on computers located 
            outside of your state, province, country, or other governmental jurisdiction 
            where the data protection laws may differ. By using our website, you consent 
            to such transfers.
          </p>
        </section>

        {/* 13. Changes to This Policy */}
        <section id="section-13" className="border-b border-zinc-100 pb-6">
          <h2 className="text-lg font-bold text-zinc-800 mb-3">
            13. Changes to This Policy
          </h2>
          <p className="text-sm text-zinc-600 leading-relaxed">
            We may update our Privacy Policy from time to time. We will notify you of any 
            changes by posting the new Privacy Policy on this page and updating the "Last 
            updated" date. You are advised to review this Privacy Policy periodically for 
            any changes.
          </p>
        </section>

        {/* 14. Contact Us */}
        <section id="section-14">
          <h2 className="text-lg font-bold text-zinc-800 mb-3 flex items-center gap-2">
            <Mail className="h-5 w-5 text-[#002b5c]" />
            14. Contact Us
          </h2>
          <p className="text-sm text-zinc-600 leading-relaxed mb-4">
            If you have any questions about this Privacy Policy, please contact us:
          </p>
          <div className="bg-zinc-50 rounded-lg p-4">
            <ul className="space-y-2 text-sm text-zinc-600">
              <li>
                <strong>Email:</strong>{" "}
                <a href="mailto:admin@next-fixture.com" className="text-[#002b5c] hover:underline">
                  admin@next-fixture.com
                </a>
              </li>
              <li>
                <strong>Response Time:</strong> We aim to respond to all privacy-related 
                inquiries within 30 days.
              </li>
            </ul>
          </div>
        </section>
      </div>

      {/* Footer Note */}
      <div className="mt-8 bg-zinc-50 border border-zinc-200 rounded-lg p-4">
        <p className="text-xs text-zinc-500 flex items-start gap-2">
          <HelpCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            This privacy policy applies to Next Fixture. For specific queries about 
            third-party services, please refer to their respective privacy policies. 
            This website does not provide gambling services directly and is for 
            informational purposes only.
          </span>
        </p>
      </div>
    </div>
  );
}
