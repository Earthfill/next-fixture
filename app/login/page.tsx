import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import AuthCard from "@/components/common/AuthCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign In",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; verified?: string; verify?: string }>;
}) {
  const { next, verified, verify } = await searchParams;
  return (
    <div className="mx-auto max-w-lg px-4 sm:px-6 py-12">
      {verified === "1" && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>Email verified.</strong> You&apos;re all set to join the match discussions.
          </span>
        </div>
      )}
      {verify === "failed" && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            That verification link is invalid or has expired. Sign in and use{" "}
            <strong>Resend verification email</strong> under a match to get a fresh one.
          </span>
        </div>
      )}
      <AuthCard mode="login" next={next} />
    </div>
  );
}
