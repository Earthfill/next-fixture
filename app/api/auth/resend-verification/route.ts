// POST /api/auth/resend-verification — re-email the verification link (login required)
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSessionUser, createEmailToken } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { verificationEmailHtml } from "@/lib/email-templates";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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

  const origin = request.nextUrl.origin;
  const link = `${origin}/api/auth/verify?token=${encodeURIComponent(emailToken.token)}`;
  after(() => {
    void sendEmail({
      to: user.email,
      subject: "Verify your email — NextFixture",
      html: verificationEmailHtml({ displayName: user.displayName, link }),
    }).catch(() => undefined);
  });

  return NextResponse.json({ success: true });
}