// POST /api/auth/resend-verification — re-email the verification link (login required)
import { NextResponse } from "next/server";
import { getSessionUser, createEmailToken } from "@/lib/auth";
import { sendEmailWithTimeout } from "@/lib/email";
import { verificationEmailHtml, resolveEmailBaseUrl } from "@/lib/email-templates";

export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
  }
  if (user.verified) {
    return NextResponse.json({ error: "Your email is already verified." }, { status: 400 });
  }

  const emailToken = await createEmailToken(user.id, user.email).catch(() => null);
  if (!emailToken) {
    return NextResponse.json(
      { error: "Could not generate a verification link. Please try again." },
      { status: 500 }
    );
  }

  const baseUrl = resolveEmailBaseUrl();
  const link = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(emailToken.token)}`;
  const result = await sendEmailWithTimeout({
    to: user.email,
    subject: "Verify your email — NextFixture",
    html: verificationEmailHtml({ displayName: user.displayName, link, siteUrl: baseUrl }),
  });
  if (!result.ok) {
    const error = result.error === "timeout"
      ? "The email service timed out. Please try again in a moment."
      : result.error ?? "Could not send the verification email.";
    return NextResponse.json({ error }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}