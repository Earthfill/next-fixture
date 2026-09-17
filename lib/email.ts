// ---------------------------------------------------------------------------
// Email — thin Resend wrapper. Gracefully degrades: if RESEND_API_KEY is
// unset/unreachable it logs and returns { ok:false } instead of throwing, so
// the auth flow never breaks just because email is unavailable.
// ---------------------------------------------------------------------------

import { Resend } from "resend";

let client: Resend | null | undefined; // undefined = uninitialized, null = unavailable

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (client === undefined) {
    try {
      client = new Resend(key);
    } catch (err) {
      console.error("[email] Resend init failed:", err instanceof Error ? err.message : err);
      client = null;
    }
  }
  return client;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<{
  ok: boolean;
  error?: string;
}> {
  const c = getClient();
  if (!c) {
    console.warn("[email] RESEND_API_KEY not configured — skipping email to", to);
    return { ok: false, error: "not_configured" };
  }
  const from = process.env.EMAIL_FROM ?? "NextFixture <onboarding@resend.dev>";
  try {
    const { error } = await c.emails.send({ from, to: [to], subject, html, text });
    if (error) {
      console.error("[email] send failed:", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] send threw:", err instanceof Error ? err.message : err);
    return { ok: false, error: "exception" };
  }
}

/**
 * Like sendEmail, but bounded by a timeout so a hung Resend call can never block
 * the registration response indefinitely. Used by the auth routes that must
 * report honestly whether the email actually went out.
 */
export async function sendEmailWithTimeout(
  input: SendEmailInput,
  timeoutMs = 8000
): Promise<{ ok: boolean; error?: string }> {
  return Promise.race([
    sendEmail(input),
    new Promise<{ ok: false; error: string }>((resolve) =>
      setTimeout(() => resolve({ ok: false, error: "timeout" }), timeoutMs)
    ),
  ]);
}
