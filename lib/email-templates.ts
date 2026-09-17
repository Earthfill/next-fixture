// ---------------------------------------------------------------------------
// Email templates — simple inline-HTML transactional emails (verification link
// + welcome). Minimal styling, works in every inbox client.
// ---------------------------------------------------------------------------
// NOTE: the brand mark uses /logo.png (raster), not /logo.svg — Gmail and
// Outlook strip SVG images from mail, and logo.svg is white-on-transparent so
// it would also be invisible on the white card. logo.png is the navy-tile
// version of the same artwork (and the logo already declared to search engines
// in app/page.tsx), so it reads correctly on white and in dark mode.
//
// URLs: every absolute link/image inside an email goes to the PUBLIC site, NOT
// to the process's request origin. Emails leave the dev machine and land in
// real inboxes, so a localhost base would render a broken logo and dead links
// for every recipient. resolveEmailBaseUrl() therefore refuses localhost
// (the .env.local default for NEXT_PUBLIC_SITE_URL) and falls back to the
// production domain.

const PRODUCTION_BASE_URL = "https://next-fixture.com";

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Canonical base URL for absolute links/images inside emails. Returns the
 * NEXT_PUBLIC_SITE_URL value when it is a public host, the production domain
 * otherwise (unset env or a localhost/dev placeholder).
 */
export function resolveEmailBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!env) return PRODUCTION_BASE_URL;
  const normalized = normalizeBase(env);
  try {
    const { hostname } = new URL(normalized);
    const isLocal =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal");
    return isLocal ? PRODUCTION_BASE_URL : normalized;
  } catch {
    return PRODUCTION_BASE_URL;
  }
}

function shell(title: string, siteUrl: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#fafafa;font-family:Inter,Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e5e5;border-radius:10px;">
            <tr>
              <td style="padding:28px;">
                <img src="${siteUrl}/logo.png" alt="Next Fixture" width="140" height="43" border="0" style="display:block;border:0;outline:none;text-decoration:none;width:140px;height:43px;" />
                ${bodyHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function verificationEmailHtml({
  displayName,
  link,
  siteUrl = resolveEmailBaseUrl(),
}: {
  displayName: string;
  link: string;
  siteUrl?: string;
}): string {
  return shell(
    "Verify your email",
    siteUrl,
    `<p style="margin:20px 0 12px;font-size:15px;line-height:1.5;color:#18181b;">
       Hi ${displayName} — thanks for joining. To verify your email and join the match discussions, click the button below.
     </p>
     <p style="margin:24px 0;">
       <a href="${link}" style="display:inline-block;background:#002b5c;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600;">Verify my email</a>
     </p>
     <p style="margin:0;font-size:13px;line-height:1.5;color:#a1a1aa;">
       Or copy and paste this link into your browser:<br />
       <span style="color:#71717a;word-break:break-all;">${link}</span>
     </p>
     <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#a1a1aa;">
       If you didn't create an account, you can safely ignore this email.
     </p>`
  );
}

export function welcomeEmailHtml({
  displayName,
  siteUrl = resolveEmailBaseUrl(),
}: {
  displayName: string;
  siteUrl?: string;
}): string {
  return shell(
    "Welcome to Next Fixture",
    siteUrl,
    `<p style="margin:20px 0 12px;font-size:15px;line-height:1.5;color:#18181b;">
       Welcome aboard, ${displayName} — your email is verified! You can now take part in the match discussions under every preview:
       share your thoughts, post predictions and reply to other fans.
     </p>
     <p style="margin:24px 0;">
       <a href="${siteUrl}/" style="display:inline-block;background:#002b5c;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600;">Browse fixtures</a>
     </p>
     <p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;">See you on matchday. — The Next Fixture team</p>`
  );
}
