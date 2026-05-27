import bcrypt    from 'bcryptjs';
import jwt       from 'jsonwebtoken';

import { User, RolePermission } from '../models/index.js';
import { triggerN8nWebhook }     from '../utils/webhook.js';

// ── Config ─────────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('[AuthService] JWT_SECRET environment variable is required in production');
}
const SECRET = JWT_SECRET ?? 'dev-only-insecure-secret-change-me';

// ── Helpers ────────────────────────────────────────────────────────────────────
/** Strip sensitive fields before returning user data */
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
   * Validate credentials and immediately issue a 24-hour JWT — no OTP step.
   */
  static async login(email: string, password: string) {
    if (!email?.trim() || !password) {
      throw new Error('Email and password are required');
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Constant-time comparison to avoid timing attacks
    const passwordOk = user
      ? await bcrypt.compare(password, user.password)
      : false;

    if (!user || !passwordOk) {
      throw new Error('Invalid credentials');
    }

    if (user.status === 'Inactive') {
      throw new Error('Your account has been disabled. Please contact your administrator.');
    }

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
