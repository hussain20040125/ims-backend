import { Router } from 'express';
import { AuditLog } from '../models/index.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// GET /api/audit-logs — paginated, searchable audit log list (Super Admin / admin only)
router.get('/', authenticate, async (req: any, res) => {
  try {
    const roleLower = (req.user?.role || '').toLowerCase().trim();
    const isAdmin = ['super admin', 'superadmin', 'admin'].includes(roleLower);
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(500, parseInt(req.query.limit as string) || 100);
    const skip  = (page - 1) * limit;
    const search = (req.query.search as string || '').trim();

    let query: any = {};
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { userName: re },
        { userEmail: re },
        { action: re },
        { resource: re },
        { resourceId: re },
      ];
    }

    const [data, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(query),
    ]);

    res.json({ success: true, data, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
