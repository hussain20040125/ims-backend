import { Router } from 'express';
import { PurchaseOrder, Quotation, MaterialRequirement } from '../models/index.js';
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
    // Helper: calculate charge total with GST
    const calcCharge = (amt: number, pct: number, type: string) => {
      if (!amt) return 0;
      return type === "Exclusive" ? amt * (1 + pct / 100) : amt;
    };
    const itemsTotal = data.items?.reduce((sum: number, item: any) => sum + (item.totalWithGST || 0), 0) || 0;
    const freightTotal = calcCharge(data.freightAmount || 0, data.freightGstPct || 0, data.freightGstType || "Exclusive");
    const loadingTotal = calcCharge(data.loadingAmount || 0, data.loadingGstPct || 0, data.loadingGstType || "Exclusive");
    const unloadingTotal = calcCharge(data.unloadingAmount || 0, data.unloadingGstPct || 0, data.unloadingGstType || "Exclusive");
    const totalValue = itemsTotal + freightTotal + loadingTotal + unloadingTotal;

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

// Cancel PO — only AGM (or Super Admin) can cancel an Approved PO
router.put('/:id/cancel', authenticate, async (req: any, res) => {
  try {
    const { cancelNote } = req.body;

    if (!cancelNote || !String(cancelNote).trim()) {
      return res.status(400).json({ success: false, message: 'Cancellation note is required' });
    }

    // Role check: only AGM or Super Admin
    const roleLower = (req.user.role || '').toLowerCase().trim();
    const isSuperAdmin = ['super admin', 'superadmin', 'admin'].includes(roleLower);
    const isAGM = roleLower === 'agm';
    if (!isSuperAdmin && !isAGM) {
      return res.status(403).json({ success: false, message: 'Only AGM can cancel approved Purchase Orders' });
    }

    // Verify PO exists and is Approved
    const po = await PurchaseOrder.findOne({ id: req.params.id });
    if (!po) return res.status(404).json({ success: false, message: 'Purchase Order not found' });
    if ((po as any).status !== 'Approved') {
      return res.status(400).json({ success: false, message: `PO is currently "${(po as any).status}". Only Approved POs can be cancelled.` });
    }

    const cancelledAt = new Date().toISOString();

    // Update PO to Cancelled
    await PurchaseOrder.findOneAndUpdate(
      { id: req.params.id },
      { status: 'Cancelled', cancelNote: String(cancelNote).trim(), cancelledBy: req.user.name, cancelledAt }
    );

    // Find and reset the linked Quotation + MR
    let quotationReset = false;
    if ((po as any).mrId) {
      const mr = await (MaterialRequirement as any).findOne({ id: (po as any).mrId });
      if (mr) {
        // Find quotation ID: prefer specific category match, fall back to MR-level approvedQuotationId
        let quotationId: string | undefined = mr.approvedQuotationId;
        if (!quotationId && Array.isArray(mr.approvals) && mr.approvals.length > 0) {
          const match = mr.approvals.find((a: any) => a.category === (po as any).workType);
          if (match) quotationId = match.quotationId;
        }

        if (quotationId) {
          const newToken = `QT-TOKEN-${quotationId}-${Date.now()}`;
          await (Quotation as any).findOneAndUpdate(
            { id: quotationId },
            { status: 'Pending', token: newToken }
          );
          quotationReset = true;
          broadcast({ type: 'DATA_UPDATED', path: 'quotations' });
        }

        // Reset MR approval
        await (MaterialRequirement as any).findOneAndUpdate(
          { id: (po as any).mrId },
          { status: 'Store Pending', $unset: { approvedQuotationId: '', approvedSupplier: '' } }
        );
        broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });
      }
    }

    broadcast({ type: 'DATA_UPDATED', path: 'pos' });

    await createNotification({
      message: `PO ${(po as any).id} cancelled by ${req.user.name}. Reason: ${String(cancelNote).trim()}`,
      severity: 'warning',
      path: 'pos',
      senderId: req.user._id,
    });

    // n8n webhook
    await triggerN8nWebhook('PO_CANCELLED', {
      poId: (po as any).id,
      cancelledBy: req.user.name,
      cancelNote: String(cancelNote).trim(),
      quotationReset,
    });

    res.json({
      success: true,
      message: `PO cancelled successfully${quotationReset ? '. Linked quotation reset to Pending.' : ''}`,
      data: { id: req.params.id, cancelledAt },
    });
  } catch (error: any) {
    console.error('Error cancelling PO:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Standard PurchaseOrder CRUD registration
createCrudRoutes(router, PurchaseOrder, 'pos', 'id', 'PURCHASE_ORDERS', 'PURCHASE_ORDER');

export default router;
