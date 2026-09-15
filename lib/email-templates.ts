// ---------------------------------------------------------------------------
// Email templates — simple inline-HTML transactional emails (verification link
// + welcome). Minimal styling, works in every inbox client.
// ---------------------------------------------------------------------------

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://next-fixture.com";

function shell(title: string, bodyHtml: string): string {
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
                <div style="font-size:14px;font-weight:700;color:#002b5c;letter-spacing:0.5px;">NEXT FIXTURE</div>
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

export function verificationEmailHtml({ displayName, link }: { displayName: string; link: string }): string {
  return shell(
    "Verify your email",
    `<p style="margin:20px 0 12px;font-size:15px;line-height:1.5;color:#18181b;">Hi ${displayName},</p>
     <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46;">
       Thanks for joining. To verify your email and join the match discussions, click the button below.
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

export function welcomeEmailHtml({ displayName }: { displayName: string }): string {
  return shell(
    "Welcome to Next Fixture",
    `<p style="margin:20px 0 12px;font-size:15px;line-height:1.5;color:#18181b;">Hi ${displayName},</p>
     <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3f3f46;">
       Your email is verified — welcome aboard! You can now take part in the match discussions under every preview:
       share your thoughts, post predictions and reply to other fans.
     </p>
     <p style="margin:24px 0;">
       <a href="${SITE_URL}/" style="display:inline-block;background:#002b5c;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600;">Browse fixtures</a>
     </p>
     <p style="margin:0;font-size:12px;line-height:1.5;color:#a1a1aa;">See you on matchday. — The Next Fixture team</p>`
  );
}
