import crypto    from 'crypto';
import bcrypt    from 'bcryptjs';
import jwt       from 'jsonwebtoken';

import { User, RolePermission } from '../models/index.js';
import { sendOTPEmail }          from '../utils/email.js';
import { triggerN8nWebhook }     from '../utils/webhook.js';

// ── Config ─────────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('[AuthService] JWT_SECRET environment variable is required in production');
}
const SECRET = JWT_SECRET ?? 'dev-only-insecure-secret-change-me';

const OTP_EXPIRY_MS = 10 * 60 * 1000;   // 10 minutes
const OTP_MAX_TRIES = 5;                 // lock after 5 wrong guesses

// ── Helpers ────────────────────────────────────────────────────────────────────
/** Strip sensitive OTP and password fields before returning user data */
const sanitiseUser = (raw: any): any => {
  const u = typeof raw.toObject === 'function' ? raw.toObject() : { ...raw };
  delete u.password;
  delete u.otpHash;
  delete u.otpExpiry;
  delete u.otpAttempts;
  return u;
};

// ── Service ────────────────────────────────────────────────────────────────────
export class AuthService {

  /**
   * Step 1 – Validate credentials, generate a 6-digit OTP, hash it, and
   * email it to the user.  Returns `{ otpRequired: true, email }` — no JWT.
   */
  static async login(email: string, password: string) {
    if (!email?.trim() || !password) {
      throw new Error('Email and password are required');
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Use a constant-time comparison result to avoid timing attacks
    const passwordOk = user
      ? await bcrypt.compare(password, user.password)
      : false;

    if (!user || !passwordOk) {
      // Generic message – do not reveal whether the email exists
      throw new Error('Invalid credentials');
    }

    if (user.status === 'Inactive') {
      throw new Error('Your account has been disabled. Please contact your administrator.');
    }

    // Generate cryptographically-secure 6-digit OTP and hash it
    const otp    = String(crypto.randomInt(100_000, 999_999));
    const hash   = await bcrypt.hash(otp, 8);          // 8 rounds is fine for a short-lived code
    const expiry = new Date(Date.now() + OTP_EXPIRY_MS);

    await User.findByIdAndUpdate(user._id, {
      otpHash:     hash,
      otpExpiry:   expiry,
      otpAttempts: 0,
    });

    await sendOTPEmail(user.email, otp, user.name);

    return { otpRequired: true as const, email: user.email };
  }

  /**
   * Step 2 – Verify the OTP, clear it from the DB, and issue a 24-hour JWT.
   */
  static async verifyOtp(email: string, otp: string) {
    if (!email?.trim() || !otp?.trim()) {
      throw new Error('Email and OTP are required');
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user || !user.otpHash) {
      throw new Error('No pending verification found. Please login again.');
    }

    // ── Attempt-limit check ────────────────────────────────────────────────
    if ((user.otpAttempts ?? 0) >= OTP_MAX_TRIES) {
      await User.findByIdAndUpdate(user._id, {
        $unset: { otpHash: 1, otpExpiry: 1 },
        otpAttempts: 0,
      });
      throw new Error('Too many incorrect attempts. Please login again to receive a new code.');
    }

    // ── Expiry check ───────────────────────────────────────────────────────
    if (!user.otpExpiry || Date.now() > new Date(user.otpExpiry).getTime()) {
      await User.findByIdAndUpdate(user._id, {
        $unset: { otpHash: 1, otpExpiry: 1 },
        otpAttempts: 0,
      });
      throw new Error('Verification code has expired. Please login again.');
    }

    // ── OTP comparison ─────────────────────────────────────────────────────
    const valid = await bcrypt.compare(otp.trim(), user.otpHash);
    if (!valid) {
      const newAttempts = (user.otpAttempts ?? 0) + 1;
      await User.findByIdAndUpdate(user._id, { otpAttempts: newAttempts });
      const remaining = OTP_MAX_TRIES - newAttempts;
      const hint = remaining > 0
        ? `${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
        : 'Please login again to get a new code.';
      throw new Error(`Invalid verification code. ${hint}`);
    }

    // ── Success: clear OTP and issue token ─────────────────────────────────
    await User.findByIdAndUpdate(user._id, {
      $unset: { otpHash: 1, otpExpiry: 1 },
      otpAttempts: 0,
    });

    const token     = jwt.sign({ id: user._id }, SECRET, { expiresIn: '24h' });
    const rolePerms = await RolePermission.findOne({ role: user.role });
    const userData  = sanitiseUser(user);
    userData.rolePermissions = rolePerms?.permissions ?? [];

    // Non-blocking login webhook
    triggerN8nWebhook('LOGIN', {
      userId: user._id.toString(),
      email:  user.email,
      name:   user.name,
      role:   user.role,
    }).catch(() => {/* intentionally swallowed */});

    return { user: userData, token };
  }

  /**
   * GET /auth/me – refresh user data and re-issue a token to extend the session.
   */
  static async getMe(userId: string) {
    const user = await User
      .findById(userId)
      .select('-password -otpHash -otpExpiry -otpAttempts');

    if (!user) throw new Error('User not found');

    const rolePerms = await RolePermission.findOne({ role: user.role });
    const userData  = user.toObject() as any;
    userData.rolePermissions = rolePerms?.permissions ?? [];

    const token = jwt.sign({ id: user._id }, SECRET, { expiresIn: '24h' });
    return { user: userData, token };
  }
}
