// ---------------------------------------------------------------------------
// Email templates — simple inline-HTML transactional emails (verification link
// + welcome). Minimal styling, works in every inbox client.
// ---------------------------------------------------------------------------
// Brand: the card is the logo's navy (#002B5C) with white text, and the accent
// is the logo's yellow (#FFD230) — used for the one call-to-action. The raster
// brand mark stays /logo.png (Gmail and Outlook strip SVG images from mail, and
// logo.svg is white-on-transparent, which wouldn't read on white). Because the
// card and the logo tile share the same navy, the mark sits flush on the card.
//
// URLs: every absolute link/image inside an email goes to the PUBLIC site, NOT
// to the process's request origin. Emails leave the dev machine and land in
// real inboxes, so a localhost base would render a broken logo and dead links
// for every recipient. resolveEmailBaseUrl() therefore refuses localhost
// (the .env.local default for NEXT_PUBLIC_SITE_URL) and falls back to the
// production domain.

const PRODUCTION_BASE_URL = "https://next-fixture.com";

// Brand palette (sampled directly from public/logo.png).
const NAVY = "#002b5c"; // logo tile / card background
const NAVY_DEEP = "#001a3a"; // page background behind the card
const YELLOW = "#ffd230"; // logo "Fixture" accent — the CTA color
const TEXT_MAIN = "#ffffff"; // headings + body copy
const TEXT_MUTED = "#b9c5d6"; // secondary copy, legible on navy

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
  <body style="margin:0;padding:0;background:${NAVY_DEEP};font-family:Inter,Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY_DEEP};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${NAVY};border:1px solid rgba(255,255,255,0.14);border-radius:12px;">
            <tr>
              <td style="padding:30px;">
                <img src="${siteUrl}/logo.png" alt="Next Fixture" width="140" height="43" border="0" style="display:block;border:0;outline:none;text-decoration:none;width:140px;height:43px;" />
                ${bodyHtml}
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:11px;line-height:1.5;color:rgba(255,255,255,0.45);">
            Next Fixture · Football predictions, previews &amp; betting tips
          </p>
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
    `<p style="margin:22px 0 12px;font-size:15px;line-height:1.6;color:${TEXT_MAIN};">
       Hi ${displayName} — thanks for joining. To verify your email and join the match discussions, click the button below.
     </p>
     <p style="margin:26px 0;">
       <a href="${link}" style="display:inline-block;background:${YELLOW};color:${NAVY_DEEP};text-decoration:none;padding:13px 24px;border-radius:8px;font-size:14px;font-weight:700;">Verify my email</a>
     </p>
     <p style="margin:0;font-size:13px;line-height:1.5;color:${TEXT_MUTED};">
       Or copy and paste this link into your browser:<br />
       <span style="color:#d6dde8;word-break:break-all;">${link}</span>
     </p>
     <p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:${TEXT_MUTED};">
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
    `<p style="margin:22px 0 12px;font-size:15px;line-height:1.6;color:${TEXT_MAIN};">
       Welcome aboard, ${displayName} — your email is verified! You can now take part in the match discussions under every preview:
       share your thoughts, post predictions and reply to other fans.
     </p>
     <p style="margin:26px 0;">
       <a href="${siteUrl}/" style="display:inline-block;background:${YELLOW};color:${NAVY_DEEP};text-decoration:none;padding:13px 24px;border-radius:8px;font-size:14px;font-weight:700;">Browse fixtures</a>
     </p>
     <p style="margin:0;font-size:12px;line-height:1.5;color:${TEXT_MUTED};">See you on matchday. — The Next Fixture team</p>`
  );
}
