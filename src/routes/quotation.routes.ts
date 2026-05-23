import { Router } from 'express';
import { createCrudRoutes } from '../utils/crud.js';
import { Quotation, MaterialRequirement } from '../models/index.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { broadcast } from '../utils/broadcaster.js';
import { triggerN8nWebhook } from '../utils/webhook.js';
import { createNotification } from '../utils/notification.js';

const router = Router();

// Custom Quotation update to handle MR approval
router.put('/:id', authenticate, async (req: any, res) => {
  try {
    const data = { ...req.body };
    const oldQuote = await Quotation.findOne({ id: req.params.id });
    const quote = await Quotation.findOneAndUpdate({ id: req.params.id }, data, { new: true });
    
    if (!quote) return res.status(404).json({ success: false, message: 'Quotation not found' });

    broadcast({ type: 'DATA_UPDATED', path: 'quotations' });
    
    if (oldQuote && oldQuote.status !== quote.status) {
      await createNotification({
        message: `QUOTATION ${quote.id} status changed to ${quote.status} by ${req.user.name}`,
        severity: quote.status === 'Approved' ? 'success' : 'info',
        path: 'quotations',
        senderId: req.user._id
      });

      // If quotation is approved, automatically approve the MR
      if (quote.status === "Approved" && quote.mrId) {
        await MaterialRequirement.findOneAndUpdate(
          { id: quote.mrId },
          { status: "Approved by AGM", approvedQuotationId: quote.id, approvedSupplier: quote.supplierName }
        );
        broadcast({ type: "DATA_UPDATED", path: "material-requirements" });
        await createNotification({
          message: `MR ${quote.mrId} approved by AGM as Quotation ${quote.id} was selected`,
          severity: "success",
          path: "material-requirements",
        });
      }

      // If quotation was Approved but now is Rejected or Pending, reset MR
      if (oldQuote?.status === "Approved" && quote.status !== "Approved" && quote.mrId) {
        const mr = await MaterialRequirement.findOne({ id: quote.mrId });
        if (mr && mr.approvedQuotationId === quote.id) {
          await MaterialRequirement.findOneAndUpdate(
            { id: quote.mrId },
            { status: "Store Pending", $unset: { approvedQuotationId: "", approvedSupplier: "" } }
          );
          broadcast({ type: "DATA_UPDATED", path: "material-requirements" });
          await createNotification({
            message: `MR ${quote.mrId} reset to Pending because approved Quotation ${quote.id} was ${quote.status}`,
            severity: "warning",
            path: "material-requirements",
          });
        }
      }
    }

    // n8n
    await triggerN8nWebhook('QUOTATION_UPDATE', {
      quotationId: quote.id,
      mrId: quote.mrId,
      supplierName: quote.supplierName,
      previousStatus: oldQuote?.status,
      newStatus: quote.status,
      updatedBy: req.user.name,
    });

    res.json({ success: true, data: quote });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Quotation standard CRUD
createCrudRoutes(router, Quotation, 'quotations', 'id', undefined, 'QUOTATION');

export default router;
