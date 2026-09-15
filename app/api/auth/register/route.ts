// POST /api/auth/register — create an account, start a session, email a link
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { hashPassword } from "@/lib/password";
import { createUser, createSession, findUserByEmail, createEmailToken } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { verificationEmailHtml } from "@/lib/email-templates";

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

  // Email a one-time verification link. Fire-and-forget AFTER the response is
  // sent so a slow Resend call never delays registration.
  const emailToken = await createEmailToken(user.id, user.email).catch(() => null);
  let verificationEmailSent = false;
  if (emailToken) {
    const origin = request.nextUrl.origin;
    const link = `${origin}/api/auth/verify?token=${encodeURIComponent(emailToken.token)}`;
    verificationEmailSent = true;
    after(() => {
      void sendEmail({
        to: user.email,
        subject: "Verify your email — NextFixture",
        html: verificationEmailHtml({ displayName: user.displayName, link }),
      }).catch(() => undefined);
    });
  }

  return NextResponse.json({ user, verificationEmailSent }, { status: 201 });
}
