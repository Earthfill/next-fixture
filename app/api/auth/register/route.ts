// POST /api/auth/register — create an account, start a session, email a link
import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/password";
import { createUser, createSession, findUserByEmail, createEmailToken } from "@/lib/auth";
import { sendEmailWithTimeout } from "@/lib/email";
import { verificationEmailHtml, resolveEmailBaseUrl } from "@/lib/email-templates";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  let body: { email?: string; displayName?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const displayName = (body.displayName ?? "").trim();
  const password = body.password ?? "";

  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
  }
  if (!displayName || displayName.length > 30) {
    return NextResponse.json({ error: "Display name must be 1-30 characters." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await findUserByEmail(email).catch(() => null);
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const user = await createUser({ email, displayName, passwordHash: hashPassword(password) });
  if (!user) {
    return NextResponse.json(
      { error: "Database unavailable. Please try again later." },
      { status: 503 }
    );
  }

  await createSession(user.id);

  // Email a one-time verification link. The link and the logo inside the email
  // must point at the PUBLIC site — not this request's origin, which is
  // localhost in dev and useless (actually broken) in a real recipient's inbox.
  const emailToken = await createEmailToken(user.id, user.email).catch(() => null);
  let verificationEmailSent = false;
  let verificationEmailError: string | null = null;
  if (emailToken) {
    const baseUrl = resolveEmailBaseUrl();
    const link = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(emailToken.token)}`;
    const result = await sendEmailWithTimeout({
      to: user.email,
      subject: "Verify your email — NextFixture",
      html: verificationEmailHtml({ displayName: user.displayName, link, siteUrl: baseUrl }),
    });
    verificationEmailSent = result.ok;
    if (!result.ok) {
      verificationEmailError = result.error ?? "Email delivery failed.";
      console.warn(`[auth:register] verification email not delivered to ${user.email}: ${verificationEmailError}`);
    }
  }

  return NextResponse.json({ user, verificationEmailSent, verificationEmailError }, { status: 201 });
}
