import { Router } from 'express';
import { Notification } from '../models/index.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// GET notifications
router.get('/', authenticate, async (req: any, res) => {
  try {
    const query: any = {};
    if (req.user.role !== 'Super Admin' && req.user.role !== 'admin') {
      query.targetRoles = { $in: [req.user.role] };
    }
    
    const notifications = await Notification.find(query).sort({ createdAt: -1 }).limit(100);
    
    const mapped = notifications.map(n => ({
      ...n.toObject(),
      read: n.readBy?.some(id => id.toString() === req.user._id.toString()) || false
    }));
    
    res.json({ success: true, data: mapped });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST mark single notification as read
router.post('/:id/read', authenticate, async (req: any, res) => {
  try {
    await Notification.findOneAndUpdate(
      { id: req.params.id },
      { $addToSet: { readBy: req.user._id } }
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST mark all notifications as read
router.post('/read-all', authenticate, async (req: any, res) => {
  try {
    await Notification.updateMany({}, { $addToSet: { readBy: req.user._id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
