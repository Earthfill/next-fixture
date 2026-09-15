import type { Metadata } from "next";
import AuthCard from "@/components/common/AuthCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Register",
  robots: { index: false, follow: false },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-lg px-4 sm:px-6 py-12">
      <AuthCard mode="register" next={next} />
    </div>
  );
}
