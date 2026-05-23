import bcrypt from 'bcryptjs';
import { User, RolePermission } from '../models/index.js';
import { triggerN8nWebhook } from '../utils/webhook.js';

export class UserService {
  static async getAll() {
    const users = await User.find().sort({ createdAt: -1 });
    
    // Add real-time rolePermissions block for clients
    const mapped = [];
    for (const u of users) {
      const rp = await RolePermission.findOne({ role: u.role });
      const obj = u.toObject() as any;
      obj.rolePermissions = rp ? rp.permissions : [];
      mapped.push(obj);
    }
    return mapped;
  }

  static async create(data: any, createdBy: string) {
    if (!data.email || !data.password) {
      throw new Error('Email and password are required');
    }
    
    // Ensure email is unique
    const exists = await User.findOne({ email: data.email });
    if (exists) {
      throw new Error('Email is already registered');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await User.create({
      ...data,
      password: hashedPassword,
      isActive: data.isActive !== undefined ? data.isActive : true,
      status: data.status || 'Active'
    });

    triggerN8nWebhook('USER_CREATE', {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      createdBy,
    }).catch(err => console.error('[UserService] User create webhook failed:', err));

    const rp = await RolePermission.findOne({ role: user.role });
    const obj = user.toObject() as any;
    obj.rolePermissions = rp ? rp.permissions : [];
    return obj;
  }

  static async update(id: string, data: any, updatedBy: string) {
    const updatePayload = { ...data };
    
    if (updatePayload.password) {
      updatePayload.password = await bcrypt.hash(updatePayload.password, 10);
    } else {
      delete updatePayload.password;
    }

    // Map legacy status to isActive or vice-versa
    if (updatePayload.status) {
      updatePayload.isActive = updatePayload.status === 'Active';
    } else if (updatePayload.isActive !== undefined) {
      updatePayload.status = updatePayload.isActive ? 'Active' : 'Inactive';
    }

    const user = await User.findByIdAndUpdate(id, { $set: updatePayload }, { new: true });
    if (!user) {
      throw new Error('User not found');
    }

    triggerN8nWebhook('USER_UPDATE', {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      updatedBy,
    }).catch(err => console.error('[UserService] User update webhook failed:', err));

    const rp = await RolePermission.findOne({ role: user.role });
    const obj = user.toObject() as any;
    obj.rolePermissions = rp ? rp.permissions : [];
    return obj;
  }

  static async delete(id: string, deletedBy: string) {
    const user = await User.findById(id);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.role.toLowerCase() === 'super admin' || user.role.toLowerCase() === 'superadmin') {
      throw new Error('Cannot delete a Super Admin user');
    }

    await User.findByIdAndDelete(id);

    triggerN8nWebhook('USER_DELETE', {
      userId: id,
      email: user.email,
      name: user.name,
      deletedBy,
    }).catch(err => console.error('[UserService] User delete webhook failed:', err));

    return true;
  }

  static async changePassword(userId: string, currentPass: string, newPass: string) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const match = await bcrypt.compare(currentPass, user.password);
    if (!match) throw new Error('Incorrect current password');

    user.password = await bcrypt.hash(newPass, 10);
    await user.save();
    return true;
  }
}
