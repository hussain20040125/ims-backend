import { logger } from '../utils/logger.js';
import { Router } from 'express';
import mongoose from 'mongoose';
import { MaterialRequirement, Inventory, MRAllocation, RolePermission } from '../models/index.js';
import { authenticate, serverHasPermission } from '../middleware/auth.middleware.js';
import { getRolesWithPermission, createNotification } from '../utils/notification.js';
import { triggerN8nWebhook } from '../utils/webhook.js';
import { broadcast } from '../utils/broadcaster.js';
import { getNextSequence } from '../utils/sequence.js';
import { createCrudRoutes } from '../utils/crud.js';
import { logAudit } from '../utils/audit.js';

const router = Router();

// GET material requirements (custom override with workflow permissions and unused filter)
router.get('/', authenticate, async (req: any, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const skip = (page - 1) * limit;
    const search = req.query.search as string;
    const unused = req.query.unused === 'true';
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

    const userRole = req.user.role;
    const rolePerm = await RolePermission.findOne({ role: userRole });
    const perms = rolePerm?.permissions || [];
    
    // Role-based filtering for MR workflow based on permissions
    const isTracking = req.query.isTracking === 'true';
    if (!isTracking && userRole !== 'Super Admin' && userRole !== 'admin' && userRole !== 'Director') {
      const allowedStatuses = new Set<string>();
      
      const canApproveStore = perms.includes('APPROVE_MR_STORE') || 
                             userRole === 'Store Incharge' ||
                             userRole === 'Inventory Manager' ||
                             userRole === 'Store Assistant';

      if (canApproveStore) {
        allowedStatuses.add("Store Pending");
      }

      if (perms.includes('VIEW_MATERIAL_REQUIREMENT') || perms.includes('CREATE_MATERIAL_REQUIREMENT')) {
        ["Approved by Store", "Approved by AGM", "Approved by Director", "Allocated", "Partially Allocated", "Partially Issued", "Closed", "Quotation Phase"].forEach(s => allowedStatuses.add(s));
      }

      query.$or = [
        { status: { $in: Array.from(allowedStatuses) } },
        { engineerId: req.user._id.toString() },
        { requesterName: req.user.name }
      ];
    }
    
    if (unused) {
      const linkedMrIds = await mongoose.model("PurchaseOrder").find({ mrId: { $nin: [null, ""] } }).distinct('mrId');
      query.id = { $nin: linkedMrIds };
    }
    
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      query.$or = [
        { id: searchRegex },
        { mrNumber: searchRegex },
        { project: searchRegex },
        { requesterName: searchRegex },
        { location: searchRegex },
        { "items.materialName": searchRegex },
        { "items.sku": searchRegex }
      ];
    }
    
    if (filterStr) {
      const { startDate: _, endDate: __, ...restFilter } = parsedFilter;
      
      if (restFilter.status === "PO Phase") {
        const linkedMrIds = await mongoose.model("PurchaseOrder").find({ mrId: { $nin: [null, ""] } }).distinct('mrId');
        if (query.id) {
          query.id = { ...query.id, $in: linkedMrIds };
        } else {
          query.id = { $in: linkedMrIds };
        }
        delete restFilter.status;
      }
      
      query = { ...query, ...restFilter };
    }

    const [items, total] = await Promise.all([
      MaterialRequirement.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      MaterialRequirement.countDocuments(query).lean()
    ]);

    res.json({ 
      success: true, 
      data: items,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error: any) {
    logger.error(`Error fetching material-requirements:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST allocate material to requisition
router.post('/allocate', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { mrId, items } = req.body; // items: Array of { sku, qty }
    
    const mr = await MaterialRequirement.findOne({ id: mrId }).session(session);
    if (!mr) throw new Error("Material Requisition not found");

    for (const allocReq of items) {
      if (!allocReq.sku || !allocReq.qty || allocReq.qty <= 0) continue;

      const mrItem = mr.items.find((i: any) => i.sku === allocReq.sku);
      if (!mrItem) continue;

      const needed = Math.max(0, mrItem.qty - (mrItem.allocatedQty || 0));
      const finalAllocQty = Math.min(allocReq.qty, needed);
      
      if (finalAllocQty <= 0) continue;

      const inv = await Inventory.findOne({ sku: allocReq.sku }).session(session);
      if (!inv) throw new Error(`Item ${allocReq.sku} not found in inventory`);
      
      const actualAvailable = Math.max(0, (inv.liveStock || 0) - (inv.allocatedQty || 0));
      if (actualAvailable < finalAllocQty) {
        throw new Error(`Insufficient available stock for ${inv.itemName} (${allocReq.sku}). Available: ${actualAvailable}, Requested: ${finalAllocQty}`);
      }

      inv.allocatedQty = (inv.allocatedQty || 0) + finalAllocQty;
      inv.availableQty = Math.max(0, (inv.liveStock || 0) - inv.allocatedQty);
      inv.totalQty = (inv.liveStock || 0) + (inv.issuedQty || 0);

      await inv.save({ session });

      await MRAllocation.create([{
        id: `ALC-${mr.id}-${allocReq.sku}-${Date.now()}`,
        mrId: mr.id,
        mrNumber: mr.mrNumber || mr.id,
        engineerName: mr.requesterName,
        projectName: mr.project,
        sku: allocReq.sku,
        itemName: inv.itemName,
        allocatedQty: finalAllocQty,
        remainingQty: finalAllocQty,
        issuedQty: 0,
        allocatedBy: req.user.name,
        allocationDate: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0]
      }], { session });

      mrItem.allocatedQty = (mrItem.allocatedQty || 0) + finalAllocQty;
      if (mrItem.allocatedQty >= mrItem.qty) {
        mrItem.status = "Allocated";
      } else {
        mrItem.status = "Partial";
      }
    }

    const allAllocated = mr.items.every((i: any) => i.status === "Allocated" || i.status === "Issued");
    mr.status = allAllocated ? "Allocated" : "Store Pending";
    await mr.save({ session });

    await session.commitTransaction();
    logAudit(req.user, 'UPDATE', 'MRAllocation', mrId, { allocatedBy: req.user.name, items: items.map((i: any) => i.sku) });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });

    res.json({ success: true, message: "Material allocated successfully" });
  } catch (error: any) {
    await session.abortTransaction();
    logger.error("Allocation Error:", error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

// Custom POST create Material Requirement to handle targeted notifications & webhooks
router.post('/', authenticate, async (req: any, res) => {
  try {
    if (!(await serverHasPermission(req.user, 'CREATE_MATERIAL_REQUIREMENT'))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const year = new Date().getFullYear();
    const seq = await getNextSequence('MR');
    const customId = `MR-${year}-${seq}`;

    const requirement = await MaterialRequirement.create({
      ...req.body,
      id: customId,
      mrNumber: customId,
      status: req.body.status || 'Store Pending',
      date: req.body.date || new Date().toISOString()
    });

    broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });
    logAudit(req.user, 'CREATE', 'MaterialRequirement', requirement.id, { project: requirement.project, requesterName: requirement.requesterName });

    const storeRoles = await getRolesWithPermission('APPROVE_MR_STORE');
    await createNotification({
      message: `New Material Requirement ${requirement.id} received for project ${requirement.project}. Store approval required.`,
      severity: 'warning',
      path: 'material-requirements',
      senderId: req.user._id,
      targetRoles: storeRoles
    });

    await triggerN8nWebhook('MATERIAL_REQ', {
      requirementId: requirement.id,
      requesterName: requirement.requesterName || req.user.name,
      project: requirement.project,
      items: requirement.items,
      location: requirement.location,
      createdBy: req.user.name
    });

    res.json({ success: true, data: requirement });
  } catch (error: any) {
    logger.error('Error creating material requirement:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Standard MaterialRequirement CRUD registration
createCrudRoutes(router, MaterialRequirement, 'material-requirements', 'id', 'MATERIAL_REQUIREMENT', 'MR');

export default router;
