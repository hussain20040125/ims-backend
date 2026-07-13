var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User, RolePermission } from "../models/index.js";
import { triggerN8nWebhook } from "../utils/webhook.js";
import { logAudit } from "../utils/audit.js";
import { sendOTPEmail } from "../utils/email.js";
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("[AuthService] JWT_SECRET environment variable is required in production");
}
const SECRET = JWT_SECRET ?? "dev-only-insecure-secret-change-me";
const sanitiseUser = /* @__PURE__ */ __name((raw) => {
  const u = typeof raw.toObject === "function" ? raw.toObject() : { ...raw };
  delete u.password;
  delete u.otpHash;
  delete u.otpExpiry;
  delete u.otpAttempts;
  return u;
}, "sanitiseUser");
class AuthService {
  static {
    __name(this, "AuthService");
  }
  /**
   * Step 1 — Validate credentials and send a 6-digit OTP to the user's email.
   * Returns { otpSent: true } — no token yet.
   */
  static async login(email, password) {
    if (!email?.trim() || !password) {
      throw new Error("Email and password are required");
    }
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+otpHash +otpExpiry +otpAttempts");
    const passwordOk = user ? await bcrypt.compare(password, user.password) : false;
    if (!user || !passwordOk) {
      throw new Error("Invalid credentials");
    }
    if (user.status === "Inactive") {
      throw new Error("Your account has been disabled. Please contact your administrator.");
    }
    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await User.findByIdAndUpdate(user._id, { otpHash, otpExpiry, otpAttempts: 0 });
    await sendOTPEmail(user.email, otp, user.name);
    return { otpSent: true, email: user.email };
  }

  /**
   * Step 2 — Verify OTP and issue JWT.
   */
  static async verifyLoginOtp(email, otp) {
    if (!email?.trim() || !otp?.trim()) {
      throw new Error("Email and OTP are required");
    }
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+otpHash +otpExpiry +otpAttempts");
    if (!user) throw new Error("Invalid request");

    if (!user.otpHash || !user.otpExpiry) {
      throw new Error("OTP expired or not requested. Please login again.");
    }
    if (new Date() > user.otpExpiry) {
      await User.findByIdAndUpdate(user._id, { otpHash: null, otpExpiry: null, otpAttempts: 0 });
      throw new Error("OTP has expired. Please login again.");
    }
    if ((user.otpAttempts || 0) >= 5) {
      await User.findByIdAndUpdate(user._id, { otpHash: null, otpExpiry: null, otpAttempts: 0 });
      throw new Error("Too many wrong attempts. Please login again.");
    }
    const otpOk = await bcrypt.compare(otp.trim(), user.otpHash);
    if (!otpOk) {
      await User.findByIdAndUpdate(user._id, { $inc: { otpAttempts: 1 } });
      throw new Error("Incorrect OTP. Please try again.");
    }
    // OTP verified — clear it and issue token
    await User.findByIdAndUpdate(user._id, { otpHash: null, otpExpiry: null, otpAttempts: 0 });
    const token = jwt.sign({ id: user._id }, SECRET, { expiresIn: "24h" });
    const rolePerms = await RolePermission.findOne({ role: user.role });
    const userData = sanitiseUser(user);
    userData.rolePermissions = rolePerms?.permissions ?? [];
    triggerN8nWebhook("LOGIN", {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role
    }).catch(() => {});
    logAudit({ _id: user._id, name: user.name, email: user.email }, "LOGIN", "Auth", undefined, { role: user.role });
    return { user: userData, token };
  }
  /**
   * POST /auth/switch-user – issue a token for a target user (admin/AGM only).
   * The caller's original token is preserved on the client; this just issues
   * a new one so the browser can impersonate without knowing the target's password.
   */
  static async switchUser(actingUser, targetUserId) {
    const ALLOWED_ROLES = ["Super Admin", "superadmin"];
    if (!ALLOWED_ROLES.some((r) => r.toLowerCase() === actingUser.role?.toLowerCase())) {
      throw new Error("Only Super Admin can switch users");
    }
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) throw new Error("Target user not found");
    if (!targetUser.isActive || targetUser.status === "Inactive") {
      throw new Error("Target user account is inactive");
    }
    const token = jwt.sign({ id: targetUser._id }, SECRET, { expiresIn: "24h" });
    const rolePerms = await RolePermission.findOne({ role: targetUser.role });
    const userData = sanitiseUser(targetUser);
    userData.rolePermissions = rolePerms?.permissions ?? [];
    logAudit(actingUser, "SWITCH_USER", "Auth", targetUser._id.toString(), {
      actingUser: actingUser.name,
      targetUser: targetUser.name,
      targetRole: targetUser.role
    });
    return { user: userData, token };
  }
  /**
   * GET /auth/me – refresh user data and re-issue a token to extend the session.
   */
  static async getMe(userId) {
    const user = await User.findById(userId).select("-password -otpHash -otpExpiry -otpAttempts");
    if (!user) throw new Error("User not found");
    const rolePerms = await RolePermission.findOne({ role: user.role });
    const userData = user.toObject();
    userData.rolePermissions = rolePerms?.permissions ?? [];
    const token = jwt.sign({ id: user._id }, SECRET, { expiresIn: "24h" });
    return { user: userData, token };
  }
}
export {
  AuthService
};
