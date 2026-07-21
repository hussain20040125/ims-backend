var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import bcrypt from "bcryptjs";
import { User } from "../models/index.js";
import { AuthService } from "../services/auth.service.js";
import { logAudit } from "../utils/audit.js";
const IS_PROD = process.env.NODE_ENV === "production";
class AuthController {
  static {
    __name(this, "AuthController");
  }
  // ── POST /api/auth/login  →  validate credentials, issue JWT ────────────
  static async login(req, res) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      res.cookie("token", result.token, {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: "none",
        maxAge: 24 * 60 * 60 * 1e3
      });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(401).json({ success: false, message: error.message });
    }
  }
  // ── POST /api/auth/logout ─────────────────────────────────────────────────
  static async logout(req, res) {
    if (req.user) logAudit(req.user, "LOGOUT", "Auth", req.user._id.toString(), { action: "User Logout" });
    res.clearCookie("token", {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "none"
    });
    res.json({ success: true });
  }
  // ── POST /api/auth/switch-user ────────────────────────────────────────────
  static async switchUser(req, res) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { targetUserId } = req.body;
      if (!targetUserId) return res.status(400).json({ success: false, message: "targetUserId is required" });
      const result = await AuthService.switchUser(req.user, targetUserId);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(403).json({ success: false, message: error.message });
    }
  }
  // ── POST /api/auth/change-password ───────────────────────────────────────
  static async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, message: "Current and new password are required" });
      }
      const user = await User.findById(req.user._id);
      if (!user) return res.status(404).json({ success: false, message: "User not found" });
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) return res.status(400).json({ success: false, message: "Current password is incorrect" });
      user.password = await bcrypt.hash(newPassword, 10);
      user.plainPassword = newPassword;
      await user.save();
      res.json({ success: true, message: "Password changed successfully" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
  // ── GET /api/auth/me ──────────────────────────────────────────────────────
  static async me(req, res) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const result = await AuthService.getMe(req.user._id);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(401).json({ success: false, message: error.message });
    }
  }
}
export {
  AuthController
};
