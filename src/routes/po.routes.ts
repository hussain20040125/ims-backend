import { Router } from 'express';
import { PurchaseOrder } from '../models/index.js';
import { authenticate, serverHasPermission } from '../middleware/auth.middleware.js';
import { getRolesWithPermission, createNotification } from '../utils/notification.js';
import { triggerN8nWebhook } from '../utils/webhook.js';
import { broadcast } from '../utils/broadcaster.js';
import { getNextSequence } from '../utils/sequence.js';
import { createCrudRoutes } from '../utils/crud.js';

const router = Router();

// Custom PO creation to handle auto sequence generation, calculated totalWithGST value, and webhooks
router.post('/', authenticate, async (req: any, res) => {
  try {
    if (!(await serverHasPermission(req.user, 'CREATE_PURCHASE_ORDER'))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const year = new Date().getFullYear();
    const seq = await getNextSequence('PO');
    const customId = `PO-${year}-${seq}`;

    const data = { ...req.body };
    const totalValue = data.items?.reduce((sum: number, item: any) => sum + (item.totalWithGST || 0), 0) || 0;
    
    const item = await PurchaseOrder.create({
      ...data,
      id: customId,
      totalValue,
      status: data.status || 'Pending L1',
      createdBy: req.user.name,
      date: data.date || new Date().toISOString().split('T')[0]
    });

    broadcast({ type: 'DATA_UPDATED', path: 'pos' });
    
    await createNotification({
      message: `New PURCHASE ORDER created by ${req.user.name}`,
      severity: 'success',
      path: 'pos',
      senderId: req.user._id
    });

    if (item.status === 'Pending L1') {
      const roles = await getRolesWithPermission('APPROVE_PURCHASE_ORDER_L1');
      await createNotification({
        message: `PO ${item.id} created and requires L1 Approval`,
        severity: 'warning',
        path: 'pos',
        senderId: req.user._id,
        targetRoles: roles
      });
    }

    // n8n webhook
    await triggerN8nWebhook('NEW_PO', {
      poId: item.id,
      supplier: item.supplier,
      totalValue: item.totalValue,
      status: item.status,
      items: item.items,
      createdBy: req.user.name,
    });

    res.json({ success: true, data: item });
  } catch (error: any) {
    console.error('Error creating PO:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Standard PurchaseOrder CRUD registration
createCrudRoutes(router, PurchaseOrder, 'pos', 'id', 'PURCHASE_ORDERS', 'PURCHASE_ORDER');

export default router;
