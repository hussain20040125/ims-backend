import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { MRService } from '../services/mr.service.js';
import { AuthenticatedRequest, serverHasPermission } from '../middleware/auth.middleware.js';
import { createNotification, getRolesWithPermission } from '../utils/notification.js';
import { broadcast } from '../utils/broadcaster.js';

export class MRController {
  static async query(req: AuthenticatedRequest, res: Response) {
    try {
      const { items, pagination } = await MRService.query(req.query);
      res.json({ success: true, data: items, pagination });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getById(req: AuthenticatedRequest, res: Response) {
    try {
      const mr = await MRService.getById(req.params.id);
      res.json({ success: true, data: mr });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  static async create(req: AuthenticatedRequest, res: Response) {
    if (!(await serverHasPermission(req.user, 'CREATE_MATERIAL_REQUIREMENT'))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    try {
      const mr = await MRService.create(req.body, req.user.name);
      broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });

      // Notify Store Approvers
      const roles = await getRolesWithPermission('APPROVE_MR_STORE');
      await createNotification({
        message: `New MR ${mr.id} from ${mr.requesterName} submitted for Store Approval`,
        severity: 'warning',
        path: 'material-requirements',
        targetRoles: roles
      });

      res.json({ success: true, data: mr });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async update(req: AuthenticatedRequest, res: Response) {
    try {
      // Check permissions for normal updates vs approval actions
      const mr = await MRService.getById(req.params.id);
      const isStoreApproval = req.body.status === 'Quotation Phase' && mr.status !== 'Quotation Phase';
      const isAGMApproval = req.body.status === 'Approved by AGM' && mr.status !== 'Approved by AGM';

      if (isStoreApproval && !(await serverHasPermission(req.user, 'APPROVE_MATERIAL_REQUIREMENT'))) {
        return res.status(403).json({ success: false, message: 'Forbidden: Store approval permission required' });
      }
      if (isAGMApproval && !(await serverHasPermission(req.user, 'APPROVE_MATERIAL_REQUIREMENT'))) {
        return res.status(403).json({ success: false, message: 'Forbidden: AGM approval permission required' });
      }
      if (!isStoreApproval && !isAGMApproval && !(await serverHasPermission(req.user, 'EDIT_MATERIAL_REQUIREMENT'))) {
        return res.status(403).json({ success: false, message: 'Forbidden: Edit MR permission required' });
      }

      const updated = await MRService.update(req.params.id, req.body, req.user.name);
      broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });
      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async delete(req: AuthenticatedRequest, res: Response) {
    if (!(await serverHasPermission(req.user, 'DELETE_MATERIAL_REQUIREMENT'))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    try {
      await MRService.delete(req.params.id, req.user.name);
      broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // Stock allocation
  static async allocate(req: AuthenticatedRequest, res: Response) {
    // Only Store managers/Admins can allocate inventory
    if (!(await serverHasPermission(req.user, 'EDIT_INVENTORY'))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    try {
      const { mrId, items } = req.body;
      if (!mrId || !items) throw new Error("mrId and items array are required");
      
      await MRService.allocate(mrId, items, req.user.name);

      broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
      broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });
      broadcast({ type: 'DATA_UPDATED', path: 'mr-allocations' });

      res.json({ success: true, message: "Material allocated successfully" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // Allocation listing
  static async queryAllocations(req: AuthenticatedRequest, res: Response) {
    try {
      const { items, pagination } = await MRService.queryAllocations(req.query);
      res.json({ success: true, data: items, pagination });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getAllocationById(req: AuthenticatedRequest, res: Response) {
    try {
      const allocation = await MRService.getAllocationById(req.params.id);
      res.json({ success: true, data: allocation });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  // Public/portal access
  static async queryPublic(req: Request, res: Response) {
    try {
      const unused = req.query.unused !== 'false';
      let query: any = { status: { $in: ['Approved by Store', 'Approved by AGM', 'Approved by Director', 'Partially Issued'] } };

      if (unused) {
        const linkedMrIds = await mongoose.model('PurchaseOrder').find({ mrId: { $nin: [null, ""] } }).distinct('mrId');
        query.id = { $nin: linkedMrIds };
      }
      
      const { items } = await MRService.query({ ...req.query, filter: query });
      res.json({ success: true, data: items });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getByIdPublic(req: Request, res: Response) {
    try {
      const mr = await MRService.getById(req.params.id);
      res.json({ success: true, data: mr });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  static async createPublic(req: Request, res: Response) {
    try {
      const mr = await MRService.create(req.body, 'Public User');
      broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });
      
      const roles = await getRolesWithPermission('APPROVE_MR_STORE');
      await createNotification({
        message: `New Public MR ${mr.id} from ${mr.requesterName} submitted for Store Approval`,
        severity: 'warning',
        path: 'material-requirements',
        targetRoles: roles
      });

      res.json({ success: true, data: mr });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
