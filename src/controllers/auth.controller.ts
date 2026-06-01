import { Request, Response } from 'express';
import { AuthService }        from '../services/auth.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { logAudit } from '../utils/audit.js';

const IS_PROD = process.env.NODE_ENV === 'production';

export class AuthController {

  // ── POST /api/auth/login  →  validate credentials, issue JWT ────────────
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);

      res.cookie('token', result.token, {
        httpOnly: true,
        secure:   IS_PROD,
        sameSite: 'none',
        maxAge:   24 * 60 * 60 * 1000,
      });

      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(401).json({ success: false, message: error.message });
    }
  }

  // ── POST /api/auth/logout ─────────────────────────────────────────────────
  static async logout(req: AuthenticatedRequest, res: Response) {
    if (req.user) logAudit(req.user, 'LOGOUT', 'Auth', req.user._id.toString(), { action: 'User Logout' });
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
