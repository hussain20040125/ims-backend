import { Router } from 'express';
import { RolePermission, User } from '../models/index.js';
import { authenticate, serverHasPermission } from '../middleware/auth.middleware.js';
import { broadcast } from '../utils/broadcaster.js';
import { triggerN8nWebhook } from '../utils/webhook.js';

const router = Router();

// GET all permissions
router.get('/', authenticate, async (req: any, res) => {
  try {
    const rolePerms = await RolePermission.find();
    res.json({ success: true, data: rolePerms });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST save/update role permissions
router.post('/', authenticate, async (req: any, res) => {
  if (!(await serverHasPermission(req.user, 'MANAGE_USERS'))) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  try {
    const { role, permissions } = req.body;
    const rolePerm = await RolePermission.findOneAndUpdate(
      { role },
      { role, permissions },
      { upsert: true, new: true }
    );
    broadcast({ type: 'DATA_UPDATED', path: 'role-permissions' });
    broadcast({ type: 'PERMISSIONS_CHANGED', role });

    await triggerN8nWebhook('ROLE_PERMISSION', {
      role,
      permissions,
      updatedBy: req.user.name,
    });

    res.json({ success: true, data: rolePerm });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE a role
router.delete('/:role', authenticate, async (req: any, res) => {
  if (!(await serverHasPermission(req.user, 'MANAGE_USERS'))) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  try {
    const { role } = req.params;
    
    // Prevent deleting Super Admin
    if (role === 'Super Admin' || role === 'superadmin') {
      return res.status(400).json({ success: false, message: 'Cannot delete Super Admin role' });
    }

    const result = await RolePermission.deleteOne({ role });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }

    broadcast({ type: 'DATA_UPDATED', path: 'role-permissions' });
    
    res.json({ success: true, message: 'Role deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST rename role
router.post('/rename', authenticate, async (req: any, res) => {
  if (!(await serverHasPermission(req.user, 'MANAGE_USERS'))) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  try {
    const { oldRole, newRole } = req.body;
    if (!oldRole || !newRole) {
       return res.status(400).json({ success: false, message: 'Missing old or new role name' });
    }
    
    // Prevent renaming Super Admin
    if (oldRole === 'Super Admin' || oldRole === 'superadmin') {
      return res.status(400).json({ success: false, message: 'Cannot rename Super Admin role' });
    }

    // Check if newRole already exists
    const exists = await RolePermission.findOne({ role: newRole });
    if (exists) {
      return res.status(400).json({ success: false, message: 'New role name already exists' });
    }

    // 1. Update RolePermission
    await RolePermission.findOneAndUpdate({ role: oldRole }, { role: newRole });
    
    // 2. Update all Users with this role
    await User.updateMany({ role: oldRole }, { role: newRole });
    
    broadcast({ type: 'DATA_UPDATED', path: 'role-permissions' });
    broadcast({ type: 'DATA_UPDATED', path: 'users' });
    
    res.json({ success: true, message: 'Role renamed successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
