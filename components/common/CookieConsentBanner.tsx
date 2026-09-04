"use client";

// ---------------------------------------------------------------------------
// CookieConsentBanner - fixed bottom consent banner. Persists the choice in
// localStorage so it only appears once per browser.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Cookie } from "lucide-react";

const STORAGE_KEY = "cookie-consent";

export default function CookieConsentBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Hide on the privacy page (where the policy is explained), but show
    // everywhere else until the user explicitly accepts or declines.
    const isPrivacyPage = pathname === "/privacy";
    let hasConsent = false;
    try {
      hasConsent = Boolean(localStorage.getItem(STORAGE_KEY));
    } catch {
      // localStorage unavailable (privacy mode) - treat as no consent
    }
    setVisible(!hasConsent && !isPrivacyPage);
  }, [pathname]);

  function setChoice(value: "accepted" | "declined"): void {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore - non-fatal
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" />
      <div className="fixed bottom-10 w-fit md:w-2/3 lg:w-1/2 2xl:w-1/3 mx-5 md:mx-auto inset-x-0 z-50 rounded-md border-t border-zinc-200 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col lg:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-3 flex-1">
            <Cookie className="h-5 w-5 text-[#002b5c] shrink-0 mt-0.5" />
            <p className="text-sm text-zinc-600 leading-relaxed">
              We use cookies to enhance your experience and analyze site traffic. By clicking
              &quot;Accept&quot; you consent to our use of cookies.{" "}
              <Link href="/privacy" className="font-medium text-[#002b5c] hover:underline">
                Learn more
              </Link>
            </p>
          </div>
          <div className="flex items-center justify-center lg:justify-normal gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setChoice("declined")}
              className="text-xs font-semibold text-zinc-500 px-3 py-2 rounded hover:bg-zinc-100"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => setChoice("accepted")}
              className="text-xs font-semibold text-white px-4 py-2 rounded"
              style={{ background: "#002b5c" }}
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
