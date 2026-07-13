var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import nodemailer from "nodemailer";

const GMAIL_CONFIGS = [
  // SSL on port 465 — often allowed when 587 is blocked
  { host: "smtp.gmail.com", port: 465, secure: true },
  // STARTTLS on port 587
  { host: "smtp.gmail.com", port: 587, secure: false },
];

const tryConfig = /* @__PURE__ */ __name(async (cfg, mailOpts) => {
  const transport = nodemailer.createTransport({
    ...cfg,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 5000,
    tls: { rejectUnauthorized: false },
  });
  try {
    const sendPromise = transport.sendMail(mailOpts);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`SMTP timeout on port ${cfg.port}`)), 5000)
    );
    await Promise.race([sendPromise, timeout]);
  } finally {
    transport.close();
  }
}, "tryConfig");

const sendOTPEmail = /* @__PURE__ */ __name(async (to, otp, name) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("\n╔════════════════════════════════════════╗");
    console.log(`║  [DEV] OTP for ${to}`);
    console.log(`║  Code: ${otp}  (expires in 10 min)`);
    console.log("╚════════════════════════════════════════╝\n");
    return;
  }

  const fromAddress = `"Neoteric IMS" <${process.env.SMTP_USER}>`;
  const year = new Date().getFullYear();
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>IMS Verification Code</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.07);max-width:520px;">
          <tr>
            <td style="background:#1E293B;padding:32px 40px;text-align:center;">
              <div style="display:inline-block;width:52px;height:52px;line-height:52px;background:#F97316;border-radius:14px;font-size:26px;font-weight:900;color:#fff;text-align:center;">N</div>
              <p style="margin:10px 0 0;color:#94A3B8;font-size:12px;letter-spacing:.8px;text-transform:uppercase;">
                Neoteric Properties &bull; IMS
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 4px;font-size:15px;color:#64748B;">Hello, <strong style="color:#0F172A;">${name}</strong></p>
              <h1 style="margin:0 0 24px;font-size:22px;font-weight:800;color:#0F172A;line-height:1.3;">
                Your verification code
              </h1>
              <div style="background:#F8FAFC;border:2px solid #E2E8F0;border-radius:12px;padding:28px 20px;text-align:center;margin:0 0 24px;">
                <span style="letter-spacing:18px;font-size:38px;font-weight:900;color:#0F172A;font-family:'Courier New',Courier,monospace;">
                  ${otp}
                </span>
              </div>
              <p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.65;">
                Enter this code on the IMS login page to complete sign-in.
                It <strong>expires in&nbsp;10&nbsp;minutes</strong>.
              </p>
              <p style="margin:0;color:#94A3B8;font-size:12px;line-height:1.6;">
                If you didn&rsquo;t request this code, someone may have entered your email by mistake.
                You can safely ignore this message &mdash; your account remains secure.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#F8FAFC;padding:18px 40px;border-top:1px solid #E2E8F0;text-align:center;">
              <p style="margin:0;font-size:11px;color:#94A3B8;line-height:1.7;">
                &copy; ${year} Neoteric Properties &bull; Garden City Portal<br>
                This is an automated security email &mdash; please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Hello ${name},`,
    ``,
    `Your IMS verification code is: ${otp}`,
    ``,
    `This code expires in 10 minutes.`,
    `If you didn't request this, you can safely ignore this email.`,
    ``,
    `— Neoteric Properties`,
  ].join("\n");

  const mailOpts = { from: fromAddress, to, subject: "Your IMS Login Verification Code", html, text };

  // Try each SMTP config in order; first success wins
  const customHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const isGmail = customHost === "smtp.gmail.com";
  // For Gmail always try both ports; for custom SMTP use the configured port only
  const configs = isGmail
    ? GMAIL_CONFIGS
    : [{ host: customHost, port: parseInt(process.env.SMTP_PORT || "587", 10), secure: process.env.SMTP_SECURE === "true" }];

  let lastErr;
  for (const cfg of configs) {
    try {
      await tryConfig(cfg, mailOpts);
      return; // success
    } catch (err) {
      console.warn(`[email] Failed on port ${cfg.port}:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr;
}, "sendOTPEmail");

export { sendOTPEmail };
