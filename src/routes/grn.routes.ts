import { logger } from '../utils/logger.js';
import { Router } from 'express';
import mongoose from 'mongoose';
import { GRN, Inward, Transaction, Inventory, PurchaseOrder } from '../models/index.js';
import { authenticate, serverHasPermission } from '../middleware/auth.middleware.js';
import { getRolesWithPermission, createNotification } from '../utils/notification.js';
import { triggerN8nWebhook, checkAndFireLowStockWebhook } from '../utils/webhook.js';
import { broadcast } from '../utils/broadcaster.js';
import { logAudit } from '../utils/audit.js';

const router = Router();

// GET all GRNs (list with pagination and search)
router.get('/', authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const skip = (page - 1) * limit;
    const search = req.query.search as string;
    const filterStr = req.query.filter as string;
    
    let query: any = {};
    
    // Date filtering
    let parsedFilter: any = {};
    if (typeof filterStr === 'string') {
      try {
        parsedFilter = JSON.parse(filterStr);
      } catch (e) {}
    } else if (filterStr && typeof filterStr === 'object') {
      parsedFilter = filterStr;
    }

    const startDate = (req.query.startDate as string) || parsedFilter?.startDate;
    const endDate = (req.query.endDate as string) || parsedFilter?.endDate;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = startDate;
      }
      if (endDate) {
        query.date.$lte = (typeof endDate === 'string' && endDate.length === 10) ? `${endDate}T23:59:59.999Z` : endDate;
      }
    }

    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { id: searchRegex },
        { poId: searchRegex },
        { supplier: searchRegex },
        { vendor: searchRegex },
        { project: searchRegex },
        { "items.itemName": searchRegex },
        { "items.sku": searchRegex }
      ];
    }
    
    if (filterStr) {
      const { startDate: _, endDate: __, ...restFilter } = parsedFilter;
      query = { ...query, ...restFilter };
    }

    const [items, total] = await Promise.all([
      GRN.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      GRN.countDocuments(query).lean()
    ]);

    res.json({ 
      success: true, 
      data: items,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error: any) {
    logger.error("Error fetching grn:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Custom GRN POST route
router.post('/', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const rawGrnData = req.body;
    const grnData = {
      ...rawGrnData,
      items: (rawGrnData.items || []).map((item: any) => ({
        ...item,
        itemName: item.itemName || "Unknown Item",
        unit: item.unit || "NOS"
      }))
    };
    
    if (!grnData.id) {
      const lastGRN = await GRN.findOne().sort({ createdAt: -1 });
      let nextId = 1;
      if (lastGRN) {
        const parts = lastGRN.id.split('-');
        nextId = parseInt(parts[parts.length - 1] || '0') + 1;
      }
      grnData.id = `GRN-${String(nextId).padStart(4, '0')}`;
    }

    const grn = await GRN.create([grnData], { session });

    const inwardRecord = {
      id: `INW-${grnData.id}`,
      date: grnData.date,
      challanNo: grnData.challan,
      mrNo: grnData.mrNo,
      supplier: grnData.supplier || grnData.vendor,
      type: 'GRN' as any,
      grnRef: grnData.id,
      project: grnData.project,
      materialPhotoUrl: grnData.materialImageUrl,
      challanPhotoUrl: grnData.challanImageUrl,
      items: grnData.items.map((item: any) => ({
        sku: item.sku,
        itemName: item.itemName,
        qty: item.received,
        unit: item.unit || 'Unit',
        condition: item.condition
      }))
    };

    for (const item of grnData.items) {
      const invItem = await Inventory.findOne({ sku: item.sku }).session(session);
      if (invItem) {
        invItem.liveStock = (invItem.liveStock || 0) + item.received;
        invItem.lastProject = grnData.project;
        await invItem.save({ session });
      } else {
        await Inventory.create([{
          sku: item.sku,
          itemName: item.itemName,
          category: "General",
          subCategory: "General",
          unit: item.unit || "NOS",
          liveStock: item.received,
          lastProject: grnData.project
        }], { session });
      }
    }

    await Inward.create([inwardRecord], { session });

    const firstItem = grnData.items[0];
    const transactionData = {
      id: `TRX-${grnData.id}`,
      type: 'Inward' as any,
      date: grnData.date,
      project: grnData.project,
      destinationProject: grnData.destinationProject,
      gatePassNo: grnData.gatePassNo,
      personName: grnData.personName,
      personPhotoUrl: grnData.personPhotoUrl,
      personPhotos: grnData.personPhotos,
      vendor: grnData.supplier || grnData.vendor,
      supplier: grnData.supplier || grnData.vendor,
      remarks: `From GRN: ${grnData.id}`,
      sku: firstItem?.sku || '',
      itemName: firstItem?.itemName || '',
      qty: grnData.items.reduce((sum: number, i: any) => sum + (i.received || 0), 0),
      unit: firstItem?.unit || 'Unit',
      items: grnData.items.map((item: any) => ({
        sku: item.sku,
        itemName: item.itemName,
        qty: item.received,
        unit: item.unit || 'Unit',
        images: item.images || [],
        materialPhotoUrl: item.images?.[0] || "",
      })),
      materialPhotoUrl: grnData.materialImageUrl,
      challanPhotoUrl: grnData.challanImageUrl,
      linkId: grnData.id,
      createdBy: req.user.name,
    };
    await Transaction.create([transactionData], { session });

    if (grnData.poId) {
      const po = await PurchaseOrder.findOne({ id: grnData.poId }).session(session);
      if (po) {
        const allGrns = await GRN.find({ poId: grnData.poId }).session(session);
        
        let allFulfilled = true;
        let anyVariance = false;
        for (const poItem of po.items) {
          const totalReceived = allGrns.reduce((sum, g) => {
            const grnItem = g.items.find((i: any) => i.sku === poItem.sku);
            return sum + (grnItem?.received || 0);
          }, 0);
          
          if (totalReceived < (poItem.qty || 0)) {
            allFulfilled = false;
            if (totalReceived > 0) anyVariance = true;
          } else if (totalReceived > (poItem.qty || 0)) {
            anyVariance = true;
          }
        }

        const newStatus = allFulfilled ? 'GRN Fulfilled' : (anyVariance ? 'GRN Variance' : 'GRN Pending');
        if (po.status !== newStatus) {
          po.status = newStatus;
          await po.save({ session });
        }

        if (allFulfilled) {
          const accountRoles = await getRolesWithPermission('REVIEW_PO_BILL');
          await createNotification({
            message: `PO ${po.id} is now GRN Fulfilled. Ready for account verification and payment.`,
            severity: 'info',
            path: 'pos',
            senderId: req.user._id,
            targetRoles: accountRoles.length ? accountRoles : ["Accountant", "Finance Manager", "Super Admin"]
          });
        }

        await createNotification({
          message: `GRN ${grn[0].id} created. PO ${grnData.poId} status: ${newStatus}`,
          severity: allFulfilled ? 'success' : 'warning',
          path: 'grn',
          senderId: req.user._id
        });

        await triggerN8nWebhook('PO_APPROVAL', { 
          poId: grnData.poId, newStatus, grnId: grn[0].id, changedBy: req.user.name 
        });
      }
    } else {
      await createNotification({
        message: `New GRN ${grn[0].id} created`,
        severity: 'success',
        path: 'grn',
        senderId: req.user._id
      });
    }

    await session.commitTransaction();
    logAudit(req.user, 'CREATE', 'GRN', grn[0].id, { poId: grnData.poId, supplier: grnData.supplier, project: grnData.project });
    broadcast({ type: 'DATA_UPDATED', path: 'grn' });
    broadcast({ type: 'DATA_UPDATED', path: 'inward' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'pos' });

    await triggerN8nWebhook('GRN', { 
      grnId: grn[0].id, 
      poId: grnData.poId, 
      vendor: grnData.supplier || grnData.vendor, 
      supplier: grnData.supplier || grnData.vendor,
      project: grnData.project, 
      items: grnData.items, 
      createdBy: req.user.name 
    });
    await checkAndFireLowStockWebhook(grnData.items.map((i: any) => i.sku));

    res.json({ success: true, data: grn[0] });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

// Custom GRN UPDATE route
router.put('/:id', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const rawGrnData = req.body;
    const oldGRN = await GRN.findOne({ id: req.params.id }).session(session);
    if (!oldGRN) throw new Error("GRN not found");
    
    const { _id, __v, createdAt, updatedAt, id: bodyId, ...grnData } = rawGrnData;

    const sanitizedItems = (rawGrnData.items || []).map((item: any) => {
      const { _id: itemId, ...itemWithoutId } = item;
      return {
        ...itemWithoutId,
        itemName: item.itemName || "Unknown Item",
        unit: item.unit || "NOS"
      };
    });
    grnData.items = sanitizedItems;

    // 1. Revert old stock
    for (const item of oldGRN.items) {
      const inv = await Inventory.findOne({ sku: item.sku }).session(session);
      if (inv) {
        inv.liveStock = Math.max(0, (inv.liveStock || 0) - (item.received || 0));
        await inv.save({ session });
      }
    }

    // 2. Apply new stock
    for (const item of sanitizedItems) {
      const inv = await Inventory.findOne({ sku: item.sku }).session(session);
      if (inv) {
        inv.liveStock = (inv.liveStock || 0) + (item.received || 0);
        inv.lastProject = grnData.project || oldGRN.project;
        await inv.save({ session });
      }
    }

    // 3. Update GRN
    const grn = await GRN.findOneAndUpdate({ id: req.params.id }, grnData, { new: true, session });
    
    // 4. Update linked Inwards
    await Inward.findOneAndUpdate({ grnRef: req.params.id }, {
      date: grnData.date,
      challanNo: grnData.challan,
      mrNo: grnData.mrNo,
      supplier: grnData.supplier || grnData.vendor,
      project: grnData.project,
      materialPhotoUrl: grnData.materialImageUrl,
      challanPhotoUrl: grnData.challanImageUrl,
      items: sanitizedItems.map((item: any) => ({
        sku: item.sku, itemName: item.itemName,
        qty: item.received, unit: item.unit, condition: item.condition
      }))
    }, { session });

    // 5. Update Transaction
    await Transaction.findOneAndUpdate({ linkId: req.params.id }, {
      date: grnData.date,
      project: grnData.project,
      supplier: grnData.supplier || grnData.vendor,
      items: sanitizedItems.map((item: any) => ({
        sku: item.sku, itemName: item.itemName, qty: item.received, unit: item.unit,
      })),
      materialPhotoUrl: grnData.materialImageUrl,
      challanPhotoUrl: grnData.challanImageUrl,
    }, { session });

    // 6. Update PO Status
    const poId = grnData.poId || oldGRN.poId;
    if (poId) {
      const po = await PurchaseOrder.findOne({ id: poId }).session(session);
      if (po) {
        const allGrns = await GRN.find({ poId }).session(session);
        const updatedGrnsList = allGrns.map(g => g.id === req.params.id ? grn : g);
        
        let allFulfilled = true;
        let anyVariance = false;
        for (const poItem of po.items) {
          const totalReceived = updatedGrnsList.reduce((sum, g) => {
            const grnItem = g?.items?.find((i: any) => i.sku === poItem.sku);
            return sum + (grnItem?.received || 0);
          }, 0);
          if (totalReceived < (poItem.qty || 0)) {
            allFulfilled = false;
            if (totalReceived > 0) anyVariance = true;
          } else if (totalReceived > (poItem.qty || 0)) {
            anyVariance = true;
          }
        }

        const newStatus = allFulfilled ? 'GRN Fulfilled' : (anyVariance ? 'GRN Variance' : 'GRN Pending');
        if (po.status !== newStatus) {
          po.status = newStatus;
          await po.save({ session });
          broadcast({ type: 'DATA_UPDATED', path: 'pos' });
        }
      }
    }

    await session.commitTransaction();
    broadcast({ type: 'DATA_UPDATED', path: 'grn' });
    broadcast({ type: 'DATA_UPDATED', path: 'inward' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });

    // n8n
    await triggerN8nWebhook('GRN_UPDATE', {
      grnId: req.params.id,
      poId: grnData.poId || oldGRN.poId,
      supplier: grnData.supplier || grnData.vendor,
      project: grnData.project,
      items: sanitizedItems,
      updatedBy: req.user.name,
    });
    await checkAndFireLowStockWebhook(sanitizedItems.map((i: any) => i.sku));

    res.json({ success: true, data: grn });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

// Custom GRN DELETE route
router.delete('/:id', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const grn = await GRN.findOne({ id: req.params.id }).session(session);
    if (!grn) throw new Error("GRN not found");
    
    const poId = grn.poId;

    // 1. Revert stock
    for (const item of grn.items) {
      const inv = await Inventory.findOne({ sku: item.sku }).session(session);
      if (inv) {
        inv.liveStock = Math.max(0, (inv.liveStock || 0) - (item.received || 0));
        await inv.save({ session });
      }
    }

    // 2. Delete linked records
    await GRN.findOneAndDelete({ id: req.params.id }).session(session);
    await Inward.deleteMany({ grnRef: req.params.id }).session(session);
    await Transaction.deleteMany({ linkId: req.params.id }).session(session);

    // 3. Update PO status
    if (poId) {
      const po = await PurchaseOrder.findOne({ id: poId }).session(session);
      if (po) {
        const remainingGrns = await GRN.find({ poId }).session(session);
        
        let allFulfilled = true;
        let anyVariance = false;
        let hasAnyReceipt = remainingGrns.length > 0;
        
        for (const poItem of po.items) {
          const totalReceived = remainingGrns.reduce((sum, g) => {
            const grnItem = g.items.find((i: any) => i.sku === poItem.sku);
            return sum + (grnItem?.received || 0);
          }, 0);
          if (totalReceived < (poItem.qty || 0)) {
            allFulfilled = false;
            if (totalReceived > 0) anyVariance = true;
          } else if (totalReceived > (poItem.qty || 0)) {
            anyVariance = true;
          }
        }

        let newStatus = allFulfilled && hasAnyReceipt ? 'GRN Fulfilled' : (anyVariance ? 'GRN Variance' : 'GRN Pending');

        if (po.status !== newStatus) {
          po.status = newStatus as any;
          await po.save({ session });
          broadcast({ type: 'DATA_UPDATED', path: 'pos' });
        }
      }
    }

    await session.commitTransaction();
    broadcast({ type: 'DATA_UPDATED', path: 'grn' });
    broadcast({ type: 'DATA_UPDATED', path: 'inward' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });

    // n8n
    await triggerN8nWebhook('GRN_DELETE', {
      grnId: req.params.id,
      poId,
      deletedBy: req.user.name,
      itemSkus: grn.items.map((i: any) => i.sku),
    });

    res.json({ success: true });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

export default router;
