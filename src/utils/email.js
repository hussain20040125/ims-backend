import nodemailer from "nodemailer";
import dns from "dns/promises";

// Render (and some cloud hosts) have broken IPv6 routing to Google SMTP.
// Pre-resolving to IPv4 guarantees we connect on the right stack.
async function resolveIPv4(hostname) {
  try {
    const [ip] = await dns.resolve4(hostname);
    return ip;
  } catch {
    return hostname;
  }
}

async function createTransport(host, port, secure) {
  const resolvedHost = await resolveIPv4(host);
  return nodemailer.createTransport({
    host: resolvedHost,
    port,
    secure,
    family: 4,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 6000,
    greetingTimeout: 6000,
    socketTimeout: 8000,
    tls: { rejectUnauthorized: false },
  });
}

async function trySend(host, port, secure, mailOpts) {
  const transport = await createTransport(host, port, secure);
  try {
    await Promise.race([
      transport.sendMail(mailOpts),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`SMTP timeout on port ${port}`)), 8000)
      ),
    ]);
  } finally {
    transport.close();
  }
}

export async function sendOTPEmail(to, otp, name) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`\n[DEV] OTP for ${to} → ${otp}  (expires in 10 min)\n`);
    return;
  }

  const from = `"Neoteric IMS" <${process.env.SMTP_USER}>`;
  const year = new Date().getFullYear();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>IMS Verification Code</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.07);max-width:520px;">
        <tr>
          <td style="background:#1E293B;padding:32px 40px;text-align:center;">
            <div style="display:inline-block;width:52px;height:52px;line-height:52px;background:#F97316;border-radius:14px;font-size:26px;font-weight:900;color:#fff;">N</div>
            <p style="margin:10px 0 0;color:#94A3B8;font-size:12px;letter-spacing:.8px;text-transform:uppercase;">Neoteric Properties &bull; IMS</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 4px;font-size:15px;color:#64748B;">Hello, <strong style="color:#0F172A;">${name}</strong></p>
            <h1 style="margin:0 0 24px;font-size:22px;font-weight:800;color:#0F172A;">Your verification code</h1>
            <div style="background:#F8FAFC;border:2px solid #E2E8F0;border-radius:12px;padding:28px 20px;text-align:center;margin:0 0 24px;">
              <span style="letter-spacing:18px;font-size:38px;font-weight:900;color:#0F172A;font-family:'Courier New',monospace;">${otp}</span>
            </div>
            <p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.65;">
              Enter this code on the IMS login page. It <strong>expires in 10 minutes</strong>.
            </p>
            <p style="margin:0;color:#94A3B8;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#F8FAFC;padding:18px 40px;border-top:1px solid #E2E8F0;text-align:center;">
            <p style="margin:0;font-size:11px;color:#94A3B8;">&copy; ${year} Neoteric Properties &bull; Garden City Portal</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Hello ${name},\n\nYour IMS verification code is: ${otp}\n\nExpires in 10 minutes.\n\n— Neoteric Properties`;

  const mailOpts = {
    from,
    to,
    subject: "Your IMS Login Verification Code",
    html,
    text,
  };

  const host = process.env.SMTP_HOST || "smtp.gmail.com";

  // For Gmail: try 587 first, then 465. For custom host: use .env config.
  const attempts =
    host === "smtp.gmail.com"
      ? [
          { host, port: 587, secure: false },
          { host, port: 465, secure: true },
        ]
      : [
          {
            host,
            port: parseInt(process.env.SMTP_PORT || "587", 10),
            secure: process.env.SMTP_SECURE === "true",
          },
        ];

  let lastErr;
  for (const attempt of attempts) {
    try {
      await trySend(attempt.host, attempt.port, attempt.secure, mailOpts);
      return;
    } catch (err) {
      console.warn(`[email] port ${attempt.port} failed:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr;
}
