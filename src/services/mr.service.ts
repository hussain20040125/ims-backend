import mongoose from 'mongoose';
import { MaterialRequirement, MRAllocation, Quotation, Inventory } from '../models/index.js';
import { getNextSequence } from '../utils/sequence.js';
import { triggerN8nWebhook } from '../utils/webhook.js';
import { POService } from './po.service.js';
import { broadcast } from '../utils/broadcaster.js';

export class MRService {
  static async query(params: any) {
    const page = parseInt(params.page) || 1;
    const limit = parseInt(params.limit) || 100;
    const skip = (page - 1) * limit;
    const search = params.search || '';
    const status = params.status;

    let query: any = {};
    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[]\]/g, '\$&'), 'i');
      query.$or = [
        { id: searchRegex },
        { project: searchRegex },
        { requesterName: searchRegex },
        { status: searchRegex }
      ];
    }
    if (status) query.status = status;

    const [items, total] = await Promise.all([
      MaterialRequirement.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      MaterialRequirement.countDocuments(query).lean()
    ]);

    return {
      items,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    };
  }

  static async getById(id: string) {
    const mr = await MaterialRequirement.findOne({ id });
    if (!mr) throw new Error('Material Requirement not found');
    return mr;
  }

  static async create(data: any, createdBy: string) {
    const year = new Date().getFullYear();
    const seq = await getNextSequence('MR');
    const customId = `MR-${year}-${seq}`;

    const mr = await MaterialRequirement.create({
      ...data,
      id: customId,
      mrNumber: customId,
      status: data.status || 'Store Pending',
      date: data.date || new Date().toISOString()
    });

    triggerN8nWebhook('MATERIAL_REQ', {
      requirementId: mr.id,
      requesterName: mr.requesterName,
      project: mr.project,
      items: mr.items,
      location: mr.location,
      createdBy,
    }).catch(err => console.error('[MRService] MR create webhook failed:', err));

    return mr;
  }

  static async update(id: string, data: any, updatedBy: string) {
    const mr = await MaterialRequirement.findOneAndUpdate({ id }, { $set: data }, { new: true });
    if (!mr) throw new Error('Material Requirement not found');

    triggerN8nWebhook('MR_UPDATE', {
      requirementId: mr.id,
      project: mr.project,
      status: mr.status,
      updatedBy,
    }).catch(err => console.error('[MRService] MR update webhook failed:', err));

    return mr;
  }

  static async delete(id: string, deletedBy: string) {
    const mr = await MaterialRequirement.findOne({ id });
    if (!mr) throw new Error('Material Requirement not found');

    await this.cascadeDeleteMR(id);

    triggerN8nWebhook('MR_DELETE', {
      requirementId: id,
      project: mr.project,
      deletedBy,
    }).catch(err => console.error('[MRService] MR delete webhook failed:', err));

    return true;
  }

  static async cascadeDeleteMR(mrId: string) {
    // 1. Delete associated Quotations
    await Quotation.deleteMany({ mrId });
    // 2. Delete associated Allocations
    await MRAllocation.deleteMany({ mrId });
    // 3. Delete associated POs (and their cascades)
    const pos = await mongoose.model('PurchaseOrder').find({ mrId }) as any[];
    for (const po of pos) {
      await POService.cascadeDeletePO(po.id);
    }
    // 4. Delete the MR itself
    await MaterialRequirement.deleteOne({ id: mrId });
    
    broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });
    broadcast({ type: 'DATA_UPDATED', path: 'quotations' });
    broadcast({ type: 'DATA_UPDATED', path: 'mr-allocations' });
  }

  // --- Stock Allocation Logic ---
  static async allocate(mrId: string, allocItems: Array<{ sku: string, qty: number }>, allocatedBy: string) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const mr = await MaterialRequirement.findOne({ id: mrId }).session(session);
      if (!mr) throw new Error("Material Requisition not found");

      for (const allocReq of allocItems) {
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

        // Layer 1 & 2 Shift
        inv.allocatedQty = (inv.allocatedQty || 0) + finalAllocQty;
        inv.availableQty = Math.max(0, (inv.liveStock || 0) - inv.allocatedQty);
        inv.totalQty = (inv.liveStock || 0) + (inv.issuedQty || 0);

        await inv.save({ session });

        // Core Allocation Record
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
          allocatedBy,
          allocationDate: new Date().toISOString(),
          date: new Date().toISOString().split('T')[0]
        }], { session });

        // Update MR Item record
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
      return true;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // --- Allocations queries ---
  static async queryAllocations(params: any) {
    const page = parseInt(params.page) || 1;
    const limit = parseInt(params.limit) || 100;
    const skip = (page - 1) * limit;
    const search = params.search || '';

    let query: any = {};
    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[]\]/g, '\$&'), 'i');
      query.$or = [
        { id: searchRegex },
        { mrId: searchRegex },
        { sku: searchRegex },
        { projectName: searchRegex }
      ];
    }

    const [items, total] = await Promise.all([
      MRAllocation.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      MRAllocation.countDocuments(query).lean()
    ]);

    return {
      items,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    };
  }

  static async getAllocationById(id: string) {
    const allocation = await MRAllocation.findOne({ id });
    if (!allocation) throw new Error('Allocation not found');
    return allocation;
  }
}
