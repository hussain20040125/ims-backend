import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate, serverHasPermission, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { getNextSequence } from './sequence.js';
import { getRolesWithPermission, createNotification } from './notification.js';
import { triggerN8nWebhook } from './webhook.js';
import { broadcast } from './broadcaster.js';
import { PurchaseOrder, MaterialRequirement, Quotation, MRAllocation, Transaction } from '../models/index.js';
import { POService } from '../services/po.service.js';
import { logAudit } from './audit.js';

export const cascadeDeleteMR = async (mrId: string) => {
  // 1. Delete associated Quotations
  await Quotation.deleteMany({ mrId });
  // 2. Delete associated Allocations
  await MRAllocation.deleteMany({ mrId });
  // 3. Delete associated POs (and their cascades)
  const pos = await PurchaseOrder.find({ mrId });
  for (const po of pos) {
    await POService.cascadeDeletePO(po.id);
  }
  // 4. Delete the MR itself
  await MaterialRequirement.deleteOne({ id: mrId });
  
  broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });
  broadcast({ type: 'DATA_UPDATED', path: 'quotations' });
  broadcast({ type: 'DATA_UPDATED', path: 'mr-allocations' });
};

export const createCrudRoutes = (
  router: Router,
  model: any,
  resourceName: string,
  idField: string = 'id',
  overrideBasePerm?: string,
  webhookEventPrefix?: string
) => {
  const basePerm = overrideBasePerm || resourceName.toUpperCase().replace(/-/g, '_');
  const singularPerm = basePerm.endsWith('S') ? basePerm.slice(0, -1) : basePerm;
  
  // GET (list) — all authenticated users can read any resource.
  // Write operations (POST/PUT/DELETE) are still permission-gated.
  router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const skip = (page - 1) * limit;
      const search = req.query.search as string;
      const filterStr = req.query.filter as string;
      let crudFilter: any = {};
      
      if (typeof filterStr === 'string') {
        try {
          crudFilter = JSON.parse(filterStr);
        } catch (e) {}
      } else if (filterStr && typeof filterStr === 'object') {
        crudFilter = filterStr;
      }
      
      let query: any = {};
      
      // Date filtering
      const startDate = (req.query.startDate as string) || (crudFilter?.startDate);
      const endDate = (req.query.endDate as string) || (crudFilter?.endDate);
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
        const keywords = search.trim().split(/\s+/).filter(k => k.length > 0);
        if (keywords.length > 0) {
          const schemaPaths = Object.keys(model.schema.paths);
          const searchFields = schemaPaths.filter(p => {
            const instance = model.schema.paths[p].instance;
            return instance === 'String';
          });
          
          if (searchFields.length > 0) {
            query.$and = keywords.map(kw => {
              const searchRegex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
              return {
                $or: searchFields.map(field => ({ [field]: searchRegex }))
              };
            });
          }
        }
      }
      
      if (filterStr) {
        const { startDate: _, endDate: __, ...restFilter } = crudFilter;
        query = { ...query, ...restFilter };
      }
      
      const [items, total] = await Promise.all([
        model.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        model.countDocuments(query).lean()
      ]);
      
      res.json({ 
        success: true, 
        data: items,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) }
      });
    } catch (error: any) {
      console.error(`Error fetching ${resourceName}:`, error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // GET (by ID) — all authenticated users can read any resource.
  router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const item = await model.findOne({ [idField]: req.params.id }).lean();
      if (!item) {
        return res.status(404).json({ success: false, message: 'Not found' });
      }
      res.json({ success: true, data: item });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });
  
  // POST (create)
  router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await serverHasPermission(req.user, `CREATE_${singularPerm}`))) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const data = { ...req.body };
      if (resourceName === 'material-requirements') {
        const seq = await getNextSequence('MR');
        data.id = `MR-2026-${seq.toString().padStart(4, '0')}`;
        data.mrNumber = data.id;
      }
      if (data.condition && typeof data.condition === 'string') {
        data.condition = data.condition.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
      }
      const item = await model.create(data);
      broadcast({ type: 'DATA_UPDATED', path: resourceName });
      logAudit(req.user, 'CREATE', resourceName, item[idField] || item.id);

      // Fire notifications asynchronously — don't block the response
      createNotification({
        message: `New ${resourceName.toUpperCase()} created by ${req.user.name}`,
        severity: 'success',
        path: resourceName,
        senderId: req.user._id
      }).catch(() => {});
      
      // Targeted notifications for approvals
      if (resourceName === 'material-requirements' && item.status === 'Store Pending') {
        const roles = await getRolesWithPermission('APPROVE_MR_STORE');
        await createNotification({
          message: `New MR ${item.id} submitted for Store Approval`,
          severity: 'warning',
          path: 'material-requirements',
          targetRoles: roles
        });
      }
      
      if (resourceName === 'material-requirements' && item.status === 'Store Pending') {
        const roles = await getRolesWithPermission('APPROVE_MR_STORE');
        await createNotification({
          message: `New Material Requirement ${item.id} received from ${item.requesterName}. Store approval required.`,
          severity: 'warning',
          path: 'material-requirements',
          senderId: req.user._id,
          targetRoles: roles
        });
      }
      
      if (resourceName === 'quotations' && item.status === 'Pending') {
        const roles = await getRolesWithPermission('VIEW_QUOTATIONS');
        await createNotification({
          message: `New Internal Quotation for MR ${item.mrId} submitted for review`,
          severity: 'info',
          path: 'quotations',
          targetRoles: roles
        });
      }
      
      // Special handling for PO L1 Approval notification
      if (resourceName === 'pos' && item.status === 'Pending L1') {
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
      if (webhookEventPrefix) {
        if (webhookEventPrefix === 'PURCHASE_ORDER') {
          // Use NEW_PO for PO creates
          await triggerN8nWebhook('NEW_PO', {
            poId: item[idField] || item.id,
            supplier: item.supplier,
            totalValue: item.totalValue,
            status: item.status,
            items: item.items,
            createdBy: req.user.name,
          });
        } else {
          await triggerN8nWebhook(`${webhookEventPrefix}_CREATE`, {
            id: item[idField] || item.id,
            resourceName,
            createdBy: req.user.name,
            data: item.toObject ? item.toObject() : item,
          });
        }
      }
      
      res.json({ success: true, data: item });
    } catch (error: any) {
      // MongoDB duplicate key error
      if (error.code === 11000) {
        const field = Object.keys(error.keyValue || {})[0] || 'name';
        const value = error.keyValue?.[field] || '';
        const label = field === 'companyName' || field === 'name' ? 'Company name' : field;
        return res.status(400).json({ success: false, message: `${label} "${value}" already exists. Please use a different name.` });
      }
      res.status(400).json({ success: false, message: error.message });
    }
  });

  // PUT (update)
  router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Special override for Purchase Order or Material Requirement approvals
      if (resourceName === 'pos' || resourceName === 'material-requirements') {
        const updateKeys = Object.keys(req.body);
        const isReject = req.body.status === 'Blocked' || req.body.status === 'Rejected';
        
        let allowed = await serverHasPermission(req.user, `EDIT_${singularPerm}`);
        
        if (resourceName === 'pos') {
          const isApprovalL1 = updateKeys.includes('approvalL1') || updateKeys.includes('approvalL1At');
          const isApprovalL2 = updateKeys.includes('approvalL2') || updateKeys.includes('approvalL2At');
          const isApprovalL3 = updateKeys.includes('approvalL3') || updateKeys.includes('approvalL3At');
          const isAccountUpdate = updateKeys.includes('accountStatus') || updateKeys.includes('payment') || updateKeys.includes('invoice');
          
          if (!allowed && isApprovalL1 && await serverHasPermission(req.user, 'APPROVE_PURCHASE_ORDER_L1')) allowed = true;
          if (!allowed && isApprovalL2 && await serverHasPermission(req.user, 'APPROVE_PURCHASE_ORDER_L2')) allowed = true;
          if (!allowed && isApprovalL3 && await serverHasPermission(req.user, 'APPROVE_PURCHASE_ORDER_L3')) allowed = true;
          if (!allowed && isAccountUpdate && (req.user.role === 'Accountant' || req.user.role === 'Finance Manager' || await serverHasPermission(req.user, 'APPROVE_PURCHASE_ORDER_BILL'))) allowed = true;
          if (!allowed && isReject && await serverHasPermission(req.user, 'REJECT_PURCHASE_ORDER')) allowed = true;
        }
        
        if (resourceName === 'material-requirements') {
          const isStatusUpdate = updateKeys.includes('status');
          if (!allowed && isStatusUpdate && await serverHasPermission(req.user, 'APPROVE_MR_STORE')) allowed = true;
        }
        
        if (!allowed) {
          return res.status(403).json({ success: false, message: 'Forbidden' });
        }
      } else {
        if (!(await serverHasPermission(req.user, `EDIT_${singularPerm}`))) {
          return res.status(403).json({ success: false, message: 'Forbidden' });
        }
      }
      
      const oldItem = await model.findOne({ [idField]: req.params.id });
      if (!oldItem) return res.status(404).json({ success: false, message: 'Not found' });
      
      // Consistency check for Updates
      if (resourceName === 'material-requirements') {
        const poExists = await PurchaseOrder.findOne({ mrId: req.params.id });
        if (poExists) {
          // Check if user is trying to change critical fields
          const criticalFields = ['items', 'project', 'location', 'mrNumber'];
          const tryingToChangeCritical = Object.keys(req.body).some(key => criticalFields.includes(key));
          
          if (tryingToChangeCritical) {
            return res.status(400).json({ 
              success: false, 
              message: `Cannot modify items or project for Material Requirement ${req.params.id} because a Purchase Order (${poExists.id}) has already been created for it.` 
            });
          }
        }

        const editFields = ['items', 'project', 'location', 'workType', 'requesterName', 'requirementDate'];
        const isEditingDetails = Object.keys(req.body).some(key => editFields.includes(key));
        if (isEditingDetails && req.body.status !== 'Approved by Store') {
          req.body.status = 'Store Pending';
        }
      }
      
      if (resourceName === 'pos') {
        const financialFields = ['items', 'totalValue', 'supplier', 'vendorBankDetails', 'total', 'grandTotal', 'totalWithGST'];
        const tryingToChangeFinancial = Object.keys(req.body).some(key => financialFields.includes(key));
        
        if (tryingToChangeFinancial) {
          // If financial data is changed, force reset approval status so it must be re-approved
          req.body.status = 'Pending L1';
          req.body.approvalL1 = 'Pending';
          req.body.approvalL2 = 'Pending';
          req.body.approvalL3 = 'Pending';
          req.body.approvalL1At = null;
          req.body.approvalL2At = null;
          req.body.approvalL3At = null;
        }
      }
      
      if (resourceName === 'quotations') {
        const quote = oldItem;
        const mr = await MaterialRequirement.findOne({ id: quote.mrId });
        
        // Check if ANY PO exists for this MR and Supplier
        const poExists = await PurchaseOrder.findOne({ mrId: quote.mrId, supplier: quote.supplierName });
        if (poExists) {
          return res.status(400).json({ 
            success: false, 
            message: `Cannot modify Quotation ${req.params.id} because a Purchase Order (${poExists.id}) has already been created against it. Please delete the Purchase Order first.` 
          });
        }
        
        // Check if it's the approved quotation for the MR
        if (mr && mr.approvedQuotationId === req.params.id && (req.body.items || req.body.supplierName || req.body.totalAmount)) {
          // If critical fields change, we force re-approval by setting status to Pending
          req.body.status = 'Pending';
        }
      }
      
      const data = { ...req.body };
      if (data.condition && typeof data.condition === 'string') {
        data.condition = data.condition.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
      }
      
      Object.assign(oldItem, data);
      const item = await oldItem.save();
      broadcast({ type: 'DATA_UPDATED', path: resourceName });
      const auditAction = item?.status !== oldItem?.status
        ? (item.status?.includes('Approved') ? 'APPROVE' : item.status?.includes('Reject') ? 'REJECT' : 'UPDATE')
        : 'UPDATE';
      logAudit(req.user, auditAction as any, resourceName, item[idField] || item.id,
        item?.status !== oldItem?.status ? { from: oldItem?.status, to: item?.status } : undefined);

      if (oldItem && item && oldItem.status !== item.status) {
        await createNotification({
          message: `${resourceName.toUpperCase()} ${item[idField] || item.id} status changed to ${item.status} by ${req.user.name}`,
          severity: item.status === 'Approved' || item.status === 'Fulfilled' ? 'success' : 'info',
          path: resourceName,
          senderId: req.user._id
        });
        
        // n8n: PO status change
        if (resourceName === 'pos') {
          await triggerN8nWebhook('PO_APPROVAL', {
            poId: item[idField] || item.id,
            previousStatus: oldItem.status,
            newStatus: item.status,
            changedBy: req.user.name
          });
          
          let nextPermission = '';
          if (item.status === 'Pending L2') nextPermission = 'APPROVE_PURCHASE_ORDER_L2';
          else if (item.status === 'Pending L3') nextPermission = 'APPROVE_PURCHASE_ORDER_L3';
          else if (item.status === 'Approved') {
            const procurementRoles = await getRolesWithPermission('VIEW_PURCHASE_ORDERS');
            await createNotification({
              message: `PO ${item.id} has been FINAL APPROVED. Procurement can now proceed.`,
              severity: 'success',
              path: 'pos',
              senderId: req.user._id,
              targetRoles: procurementRoles.length ? procurementRoles : ["Purchase coordinator", "Super Admin"]
            });
          } else if (item.status === 'Rejected' || item.status === 'Blocked') {
            await createNotification({
              message: `Purchase Order ${item.id} was ${item.status} by ${req.user.name}.`,
              severity: 'error',
              path: 'pos',
              targetRoles: ["Super Admin", "admin", "Purchase coordinator"]
            });
          }
          
          if (nextPermission) {
            const roles = await getRolesWithPermission(nextPermission);
            await createNotification({
              message: `PO ${item.id} moved to ${item.status}. Approval required.`,
              severity: 'warning',
              path: 'pos',
              senderId: req.user._id,
              targetRoles: roles
            });
          }
        }
        
        if (resourceName === 'material-requirements') {
          let nextPermission = '';
          let message = '';
          
          if (item.status === 'Approved by Store') {
            nextPermission = 'CREATE_PO';
            message = `MR ${item.id} approved by Store. It is now ready for Procurement.`;
          } else if (item.status === 'Approved by AGM') {
            nextPermission = 'CREATE_PO';
            message = `MR ${item.id} approved by AGM. It is now in Quotation/Procurement phase.`;
          } else if (item.status === 'Rejected') {
            await createNotification({
              message: `Your Material Requirement ${item.id} was rejected.`,
              severity: 'error',
              path: 'material-requirements',
              targetRoles: ['Super Admin', 'admin', 'Store Manager', 'Project Manager']
            });
          }
          
          if (nextPermission) {
            const roles = await getRolesWithPermission(nextPermission);
            await createNotification({
              message: message,
              severity: 'warning',
              path: 'material-requirements',
              senderId: req.user._id,
              targetRoles: roles
            });
          }
        }
      }
      
      // n8n: update webhook
      if (webhookEventPrefix) {
        const updateEvent = webhookEventPrefix === 'PURCHASE_ORDER'
          ? 'PO_UPDATE'
          : `${webhookEventPrefix}_UPDATE`;
        
        await triggerN8nWebhook(updateEvent, {
          id: item ? (item[idField] || item.id) : req.params.id,
          resourceName,
          updatedBy: req.user.name,
          previousStatus: oldItem?.status,
          newStatus: item?.status,
          changedFields: Object.keys(req.body),
          data: item?.toObject ? item.toObject() : item,
        });
      }
      
      // Generic Notification for ANY status change that sounds like approval is needed
      if (oldItem && item && oldItem.status !== item.status && item.status.includes('Pending')) {
        const resourcePerm = resourceName.toUpperCase().replace(/-/g, '_');
        const singularPerm = resourcePerm.endsWith('S') ? resourcePerm.slice(0, -1) : resourcePerm;
        
        let roles = await getRolesWithPermission(`APPROVE_${resourcePerm}`);
        if (roles.length === 0) {
          roles = await getRolesWithPermission(`APPROVE_${singularPerm}`);
        }
        
        if (roles.length > 0) {
          await createNotification({
            message: `${resourceName.toUpperCase()} ${item[idField] || item.id} moved to ${item.status}. Approval required.`,
            severity: 'warning',
            path: resourceName,
            senderId: req.user._id,
            targetRoles: roles
          });
        }
      }
      
      res.json({ success: true, data: item });
    } catch (error: any) {
      // MongoDB duplicate key error
      if (error.code === 11000) {
        const field = Object.keys(error.keyValue || {})[0] || 'name';
        const value = error.keyValue?.[field] || '';
        const label = field === 'companyName' || field === 'name' ? 'Company name' : field;
        return res.status(400).json({ success: false, message: `${label} "${value}" already exists. Please use a different name.` });
      }
      res.status(400).json({ success: false, message: error.message });
    }
  });

  // DELETE
  router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await serverHasPermission(req.user, `DELETE_${singularPerm}`))) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      
      // Consistency Check for Deletion
      const itemToDelete = await model.findOne({ [idField]: req.params.id });
      if (!itemToDelete) return res.status(404).json({ success: false, message: 'Not found' });
      
      const deletedItem = itemToDelete;
      const isSuperAdmin = req.user.role === 'Super Admin' || req.user.role === 'superadmin';
      
      if (resourceName === 'material-requirements') {
        const poExists = await PurchaseOrder.findOne({ mrId: req.params.id });
        if (poExists && !isSuperAdmin) {
          return res.status(403).json({ 
            success: false, 
            message: `Cannot delete Material Requirement ${req.params.id} because a Purchase Order (${poExists.id}) has already been created for it. Only Super Admin can delete.` 
          });
        }
        await cascadeDeleteMR(req.params.id);
      } else if (resourceName === 'pos') {
        const po = itemToDelete;
        const isLocked = po.accountStatus === 'Paid' || po.status === 'PO Closed' || (po.paymentStatus === 'Paid');
        if (isLocked && !isSuperAdmin) {
          return res.status(403).json({ 
            success: false, 
            message: `Cannot delete Purchase Order ${req.params.id} because payment has been processed or the PO is closed. Only Super Admin can delete.` 
          });
        }
        await POService.cascadeDeletePO(req.params.id);
      } else if (resourceName === 'suppliers') {
        const poExists = await PurchaseOrder.findOne({ supplier: itemToDelete.companyName });
        if (poExists) {
          return res.status(400).json({ 
            success: false, 
            message: `Cannot delete Supplier ${itemToDelete.companyName} because Purchase Orders exist for this supplier.` 
          });
        }
        await model.findOneAndDelete({ [idField]: req.params.id });
      } else if (resourceName === 'inventory') {
        const transactionExists = await Transaction.findOne({ "items.sku": itemToDelete.sku });
        if (transactionExists) {
          return res.status(400).json({ 
            success: false, 
            message: `Cannot delete Inventory item ${itemToDelete.sku} because it has transaction history.` 
          });
        }
        await model.findOneAndDelete({ [idField]: req.params.id });
      } else if (resourceName === 'quotations') {
        const quote = itemToDelete;
        const poExists = await PurchaseOrder.findOne({ mrId: quote.mrId, supplier: quote.supplierName });
        if (poExists) {
          return res.status(400).json({ 
            success: false, 
            message: `Cannot delete Quotation ${req.params.id} because a Purchase Order (${poExists.id}) has already been created against it. Please delete the Purchase Order first.` 
          });
        }
        
        const mrApproved = await MaterialRequirement.findOne({ approvedQuotationId: req.params.id });
        if (mrApproved) {
          return res.status(400).json({ 
            success: false, 
            message: `Cannot delete Quotation ${req.params.id} because it is the currently approved quotation for Material Requirement ${mrApproved.id}. Change the approved quotation first.` 
          });
        }
        await model.findOneAndDelete({ [idField]: req.params.id });
      } else {
        await model.findOneAndDelete({ [idField]: req.params.id });
      }
      
      broadcast({ type: 'DATA_UPDATED', path: resourceName });
      logAudit(req.user, 'DELETE', resourceName, req.params.id);

      await createNotification({
        message: `${resourceName.toUpperCase()} ${req.params.id} was deleted by ${req.user.name}`,
        severity: 'warning',
        path: resourceName,
        senderId: req.user._id
      });
      
      // n8n webhook
      if (webhookEventPrefix) {
        const eventName = webhookEventPrefix === 'PURCHASE_ORDER' ? 'PO_DELETE' : `${webhookEventPrefix}_DELETE`;
        await triggerN8nWebhook(eventName, {
          id: req.params.id,
          resourceName,
          deletedBy: req.user.name,
          snapshot: deletedItem?.toObject ? deletedItem.toObject() : deletedItem,
        });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  });
};
