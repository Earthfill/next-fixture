// GET /api/auth/verify?token=… — verify the account, auto-login, welcome email
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifyEmailToken, createSession } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { welcomeEmailHtml } from "@/lib/email-templates";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const origin = request.nextUrl.origin;

  if (!token) {
    return NextResponse.redirect(new URL("/login?verify=failed", origin));
  }

  const result = await verifyEmailToken(token).catch(() => null);
  if (!result) {
    return NextResponse.redirect(new URL("/login?verify=failed", origin));
  }

  // The link proves ownership of the email — log the user in right away.
  await createSession(result.userId).catch(() => undefined);

  // Welcome email, sent after the redirect response.
  after(() => {
    void sendEmail({
      to: result.email,
      subject: "Welcome to NextFixture",
      html: welcomeEmailHtml({ displayName: result.displayName }),
    }).catch(() => undefined);
  });

  return NextResponse.redirect(new URL("/login?verified=1", origin));
}