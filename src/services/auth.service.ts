import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, RolePermission } from '../models/index.js';
import { triggerN8nWebhook } from '../utils/webhook.js';

const JWT_SECRET = process.env.JWT_SECRET || 'neoteric-secret-key-default';

export class AuthService {
  static async login(email: string, password: string) {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '24h' });
    
    const rolePerms = await RolePermission.findOne({ role: user.role });
    const userData = user.toObject() as any;
    userData.rolePermissions = rolePerms ? rolePerms.permissions : [];

    // Trigger non-blocking login webhook
    triggerN8nWebhook('LOGIN', {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    }).catch(err => console.error('[AuthService] Login webhook failed:', err));

    return { user: userData, token };
  }

  static async getMe(userId: string) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const rolePerms = await RolePermission.findOne({ role: user.role });
    const userData = user.toObject() as any;
    userData.rolePermissions = rolePerms ? rolePerms.permissions : [];
    
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '24h' });
    
    return { user: userData, token };
  }
}
