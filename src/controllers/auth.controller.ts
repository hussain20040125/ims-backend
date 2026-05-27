import { Request, Response } from 'express';
import { AuthService }        from '../services/auth.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

const IS_PROD = process.env.NODE_ENV === 'production';

export class AuthController {

  // ── POST /api/auth/login  →  validate credentials, send OTP ──────────────
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      // Returns { otpRequired: true, email } — no token yet
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(401).json({ success: false, message: error.message });
    }
  }

  // ── POST /api/auth/verify-otp  →  validate OTP, issue JWT ────────────────
  static async verifyOtp(req: Request, res: Response) {
    try {
      const { email, otp } = req.body;
      const result = await AuthService.verifyOtp(email, otp);

      res.cookie('token', result.token, {
        httpOnly: true,
        secure:   IS_PROD,        // HTTPS only in production
        sameSite: 'none',
        maxAge:   24 * 60 * 60 * 1000,
      });

      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(401).json({ success: false, message: error.message });
    }
  }

  // ── POST /api/auth/logout ─────────────────────────────────────────────────
  static async logout(_req: Request, res: Response) {
    res.clearCookie('token', {
      httpOnly: true,
      secure:   IS_PROD,
      sameSite: 'none',
    });
    res.json({ success: true });
  }

  // ── GET /api/auth/me ──────────────────────────────────────────────────────
  static async me(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const result = await AuthService.getMe(req.user._id);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(401).json({ success: false, message: error.message });
    }
  }
}
