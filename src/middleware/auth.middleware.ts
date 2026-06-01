import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, RolePermission } from '../models/index.js';

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-only-secret' : '');

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  let token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
  
  if (token === 'null' || token === 'undefined') {
    token = null;
  }

  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = await User.findById(decoded.id);
    if (!req.user || !req.user.isActive) return res.status(401).json({ success: false, message: 'Unauthorized' });
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
};

export async function serverHasPermission(user: any, permission: string): Promise<boolean> {
  if (!user) return false;
  const roleLower = (user.role || "").toLowerCase().trim();
  if (roleLower === 'super admin' || roleLower === 'superadmin' || roleLower === 'admin') return true;

  // VIEW_* permissions are open to all authenticated users — data visibility
  // must be the same for everyone. Only write/action permissions are role-gated.
  if (permission.startsWith('VIEW_')) return true;

  // Case-insensitive role lookup for write/action permissions
  const rolePerm = await RolePermission.findOne({ role: { $regex: new RegExp(`^${user.role}$`, 'i') } });
  if (rolePerm?.permissions.includes(permission)) return true;
  if (user.permissions?.includes(permission)) return true;

  return false;
}
