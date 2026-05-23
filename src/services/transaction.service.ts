import mongoose from 'mongoose';
import { 
  Transaction, Inward, Outward, InwardReturn, OutwardReturn, 
  Inventory, MRAllocation, MaterialRequirement 
} from '../models/index.js';
import { triggerN8nWebhook, checkAndFireLowStockWebhook } from '../utils/webhook.js';
import { broadcast } from '../utils/broadcaster.js';

export class TransactionService {
  
  // --- Stock Update Helper (Private/Internal) ---
  static async updateStock(
    type: string, sku: string, itemName: string, qty: number,
    unit: string, category: string, session?: any
  ) {
    let isPositive = false;
    let isNegative = false;

    if (["Inward", "Outward Return", "Public Inward", "Public Outward Return", "Public Transfer Inward", "Transfer Inward", "GRN"].includes(type)) {
      isPositive = true;
    } else if (["Outward", "Inward Return", "Public Outward", "Public Inward Return", "Public Transfer Outward", "Transfer Outward"].includes(type)) {
      isNegative = true;
    }

    if (isPositive || isNegative) {
      const inv = session
        ? await Inventory.findOne({ sku }).session(session)
        : await Inventory.findOne({ sku });

      if (inv) {
        if (isPositive) {
          inv.totalQty = (inv.totalQty || 0) + qty;
          inv.availableQty = (inv.availableQty || 0) + qty;
        } else {
          inv.totalQty = (inv.totalQty || 0) - qty;
          inv.availableQty = (inv.availableQty || 0) - qty;
        }
        inv.liveStock = (inv.availableQty || 0) + (inv.allocatedQty || 0);
        await inv.save(session ? { session } : undefined);
      } else if (isPositive) {
        await Inventory.create(
          [{ 
            sku, itemName, 
            category: category || "General", 
            subCategory: "General", 
            unit: unit || "NOS", 
            openingStock: 0, 
            totalQty: qty,
            availableQty: qty,
            allocatedQty: 0,
            issuedQty: 0,
            liveStock: qty, 
            condition: "New" 
          }],
          session ? { session } : undefined
        );
      }
    }
  }

  // --- Transactions query ---
  static async query(params: any) {
    const page = parseInt(params.page) || 1;
    const limit = parseInt(params.limit) || 10000;
    const skip = (page - 1) * limit;
    const search = params.search;
    const filterStr = params.filter;

    let query: any = {};
    let parsedFilter: any = {};

    if (typeof filterStr === 'string') {
      try {
        parsedFilter = JSON.parse(filterStr);
      } catch (e) {}
    } else if (filterStr && typeof filterStr === 'object') {
      parsedFilter = filterStr;
    }

    const startDate = params.startDate || parsedFilter?.startDate;
    const endDate = params.endDate || parsedFilter?.endDate;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) {
        query.date.$lte = (typeof endDate === 'string' && endDate.length === 10) ? `${endDate}T23:59:59.999Z` : endDate;
      }
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { id: searchRegex },
        { date: searchRegex },
        { project: searchRegex },
        { supplier: searchRegex },
        { handoverTo: searchRegex },
        { 'items.itemName': searchRegex },
        { 'items.sku': searchRegex }
      ];
    }

    if (filterStr) {
      try {
        const filter = typeof filterStr === 'string' ? JSON.parse(filterStr) : filterStr;
        query = { ...query, ...filter };
      } catch (e) {}
    }

    const [items, total] = await Promise.all([
      Transaction.find(query).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      Transaction.countDocuments(query).lean()
    ]);

    return {
      items,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    };
  }

  // --- Inward Endpoints ---
  static async createInward(data: any, createdBy: string) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const inwardData = { ...data, type: data.type || "Manual" };
      const inward = await Inward.create([inwardData], { session });

      for (const item of data.items) {
        await this.updateStock(
          data.type === "Transfer" ? "Transfer Inward" : "Inward",
          item.sku, item.itemName, item.qty, item.unit, data.category,
          session
        );
      }

      await Transaction.create([{
        ...inwardData,
        type: data.type === "Transfer" ? "Transfer Inward" : (data.type || "Inward")
      }], { session });

      await session.commitTransaction();

      triggerN8nWebhook('INWARD', { transactionId: data.id, ...data }).catch(err => console.error(err));
      checkAndFireLowStockWebhook(data.items.map((i: any) => i.sku)).catch(err => console.error(err));

      return inward[0];
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  static async updateInward(id: string, data: any, updatedBy: string) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const oldItem = await Inward.findOne({ id }).session(session);
      if (!oldItem) throw new Error("Inward item not found");

      const newData = { ...data };
      delete newData._id;

      // Revert old stock
      for (const item of oldItem.items) {
        await this.updateStock("Inward", item.sku, item.itemName, -item.qty, item.unit || "", (oldItem as any).category || "General", session);
      }
      // Apply new stock
      for (const item of newData.items) {
        await this.updateStock("Inward", item.sku, item.itemName, item.qty, item.unit || "", (newData as any).category || "General", session);
      }

      const updated = await Inward.findOneAndUpdate({ id }, newData, { new: true, session });
      await Transaction.findOneAndUpdate(
        { id },
        { ...newData, type: newData.type === "Transfer" ? "Transfer Inward" : (newData.type || "Inward") },
        { session }
      );

      await session.commitTransaction();

      triggerN8nWebhook('INWARD_UPDATE', {
        transactionId: id,
        updatedBy,
        items: newData.items,
        project: newData.project,
      }).catch(err => console.error(err));
      checkAndFireLowStockWebhook(newData.items.map((i: any) => i.sku)).catch(err => console.error(err));

      return updated;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  static async deleteInward(id: string, deletedBy: string) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const item = await Inward.findOne({ id }).session(session);
      if (item) {
        for (const it of item.items) {
          await this.updateStock("Inward", it.sku, it.itemName, -it.qty, it.unit || "", (item as any).category || "General", session);
        }
        await Inward.findOneAndDelete({ id }).session(session);
        await Transaction.findOneAndDelete({ id }).session(session);

        triggerN8nWebhook('INWARD_DELETE', {
          transactionId: id,
          deletedBy,
          itemSkus: item.items.map((i: any) => i.sku),
        }).catch(err => console.error(err));
      }
      await session.commitTransaction();
      return true;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // --- Outward Endpoints ---
  static async createOutward(data: any, createdBy: string) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const outwardData = { 
        ...data, 
        status: "Confirmed", 
        type: data.type || (data.mrId ? "MR-Outward" : "Manual") 
      };
      const outward = await Outward.create([outwardData], { session });

      for (const item of data.items) {
        if (data.mrId) {
          let allocation = await MRAllocation.findOne({ 
            mrId: data.mrId, 
            sku: item.sku
          }).session(session);

          const mr = await MaterialRequirement.findOne({ id: data.mrId }).session(session);
          if (!mr) throw new Error("Material Requirement not found");
          
          const mrItem = mr.items.find((i: any) => i.sku === item.sku);
          if (!mrItem) throw new Error(`Item ${item.sku} not found in MR ${data.mrId}`);

          const totalAfterThis = (mrItem.issuedQty || 0) + item.qty;
          if (totalAfterThis > mrItem.qty) {
            throw new Error(`Cannot issue ${item.qty} for ${item.itemName}. Total issued (${totalAfterThis}) would exceed requested quantity (${mrItem.qty}).`);
          }

          const inv = await Inventory.findOne({ sku: item.sku }).session(session);
          if (!inv) throw new Error(`Inventory item not found for ${item.sku}`);

          let fromAllocation = 0;
          let fromAvailable = 0;

          if (allocation && allocation.remainingQty > 0) {
            fromAllocation = Math.min(item.qty, allocation.remainingQty);
            fromAvailable = item.qty - fromAllocation;
          } else {
            fromAvailable = item.qty;
          }

          if (fromAvailable > 0 && inv.availableQty < fromAvailable) {
            throw new Error(`Insufficient available stock for ${item.itemName}. Need ${fromAvailable} more, but only ${inv.availableQty} available.`);
          }

          if (allocation) {
            allocation.issuedQty = (allocation.issuedQty || 0) + fromAllocation;
            allocation.remainingQty = (allocation.remainingQty || 0) - fromAllocation;
            if (allocation.remainingQty === 0) allocation.status = "Closed";
            else allocation.status = "Partially Issued";
            await allocation.save({ session });
          }

          mrItem.issuedQty = (mrItem.issuedQty || 0) + item.qty;
          if (mrItem.issuedQty >= mrItem.qty) mrItem.status = "Issued";
          else mrItem.status = "Partial";
          
          const allItems = mr.items || [];
          const allClosed = allItems.length > 0 && allItems.every((i: any) => i.issuedQty >= i.qty);
          mr.status = allClosed ? 'Closed' : 'Partially Issued';
          await mr.save({ session });

          inv.liveStock = (inv.liveStock || 0) - item.qty;
          inv.allocatedQty = (inv.allocatedQty || 0) - fromAllocation;
          inv.issuedQty = (inv.issuedQty || 0) + item.qty;
          await inv.save({ session });
        } else {
          await this.updateStock(
            data.type === "Transfer" ? "Transfer Outward" : "Outward",
            item.sku, item.itemName, item.qty, item.unit, data.category || "General", session
          );
        }
      }

      await Transaction.create([{
        ...outwardData,
        type: data.type === "Transfer" ? "Transfer Outward" : (data.type || "Outward")
      }], { session });

      await session.commitTransaction();

      triggerN8nWebhook('OUTWARD', { transactionId: data.id, ...data }).catch(err => console.error(err));
      checkAndFireLowStockWebhook(data.items.map((i: any) => i.sku)).catch(err => console.error(err));

      return outward[0];
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // --- Outward Deletion ---
  static async deleteOutward(id: string, deletedBy: string) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const tx = await Transaction.findOne({ id }).session(session);
      if (!tx) throw new Error("Transaction not found");

      for (const it of tx.items || []) {
        if (!it.sku) continue;
        let fromAllocationTotal = 0;

        const effectiveMrId = tx.mrId || (tx as any).mrNo;
        if (effectiveMrId) {
          const allocations = await MRAllocation.find({ mrId: effectiveMrId, sku: it.sku }).session(session);
          let remainingToReturn = it.qty;
          for (const allocation of allocations) {
            if (remainingToReturn <= 0) break;
            const fromThisAlloc = Math.min(remainingToReturn, allocation.issuedQty || 0);
            allocation.issuedQty = Math.max(0, (allocation.issuedQty || 0) - fromThisAlloc);
            allocation.remainingQty = (allocation.remainingQty || 0) + fromThisAlloc;
            allocation.status = (allocation.issuedQty || 0) === 0 ? "Allocated" : "Partially Issued";
            await allocation.save({ session });
            fromAllocationTotal += fromThisAlloc;
            remainingToReturn -= fromThisAlloc;
          }

          const mr = await MaterialRequirement.findOne({ id: effectiveMrId }).session(session);
          if (mr) {
            const mrItem = mr.items.find((mi: any) => (mi.sku || "").toLowerCase() === (it.sku || "").toLowerCase());
            if (mrItem) {
              mrItem.issuedQty = Math.max(0, (mrItem.issuedQty || 0) - it.qty);
              mrItem.allocatedQty = (mrItem.allocatedQty || 0) + fromAllocationTotal;
              
              const totalFulfilled = (mrItem.issuedQty || 0) + (mrItem.allocatedQty || 0);
              if (mrItem.issuedQty >= mrItem.qty) mrItem.status = "Issued";
              else if (totalFulfilled >= mrItem.qty) mrItem.status = "Allocated";
              else if (totalFulfilled > 0) mrItem.status = "Partial";
              else mrItem.status = "In Stock";
            }
            
            const allIssued = mr.items.length > 0 && mr.items.every((mi: any) => (mi.issuedQty || 0) >= mi.qty);
            const someIssued = mr.items.some((mi: any) => (mi.issuedQty || 0) > 0);
            const allAllocated = mr.items.every((mi: any) => (mi.issuedQty || 0) + (mi.allocatedQty || 0) >= mi.qty);
            const someAllocated = mr.items.some((mi: any) => (mi.issuedQty || 0) + (mi.allocatedQty || 0) > 0);
            
            if (allIssued) mr.status = 'Closed';
            else if (someIssued) mr.status = 'Partially Issued';
            else if (allAllocated) mr.status = 'Allocated';
            else if (someAllocated) mr.status = 'Partially Allocated';
            else (mr as any).status = 'Approved';
            
            await mr.save({ session });
          }
        }

        const inv = await Inventory.findOne({ sku: it.sku }).session(session);
        if (inv) {
          inv.liveStock = (inv.liveStock || 0) + it.qty;
          inv.issuedQty = Math.max(0, (inv.issuedQty || 0) - it.qty);
          inv.allocatedQty = (inv.allocatedQty || 0) + fromAllocationTotal;
          await inv.save({ session });
        }
      }

      await Transaction.findOneAndDelete({ id }).session(session);
      await Outward.findOneAndDelete({ id }).session(session);
      await session.commitTransaction();
      return true;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // --- Inward Return Endpoints ---
  static async createInwardReturn(data: any, createdBy: string) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const item = await InwardReturn.create([data], { session });
      for (const it of data.items) {
        await this.updateStock("Inward Return", it.sku, it.itemName, it.qty, it.unit, "General", session);
      }
      await Transaction.create([{ ...data, type: "Inward Return" }], { session });
      await session.commitTransaction();
      
      triggerN8nWebhook('INWARD_RETURN', { transactionId: data.id, ...data }).catch(err => console.error(err));
      return item[0];
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  static async updateInwardReturn(id: string, data: any, updatedBy: string) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const oldItem = await InwardReturn.findOne({ id }).session(session);
      if (!oldItem) throw new Error("Inward Return not found");

      for (const it of oldItem.items) {
        await this.updateStock("Inward Return", it.sku, it.itemName, -it.qty, it.unit, "General", session);
      }
      for (const it of data.items) {
        await this.updateStock("Inward Return", it.sku, it.itemName, it.qty, it.unit, "General", session);
      }

      const item = await InwardReturn.findOneAndUpdate({ id }, data, { new: true, session });
      await Transaction.findOneAndUpdate({ id }, { ...data, type: "Inward Return" }, { session });
      await session.commitTransaction();

      triggerN8nWebhook('INWARD_RETURN_UPDATE', {
        transactionId: id,
        updatedBy,
        items: data.items,
        project: data.project,
      }).catch(err => console.error(err));
      return item;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  static async deleteInwardReturn(id: string, deletedBy: string) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const item = await InwardReturn.findOne({ id }).session(session);
      if (item) {
        for (const it of item.items) {
          await this.updateStock("Inward Return", it.sku, it.itemName, -it.qty, it.unit, "General", session);
        }
        await InwardReturn.findOneAndDelete({ id }).session(session);
        await Transaction.findOneAndDelete({ id }).session(session);

        triggerN8nWebhook('INWARD_RETURN_DELETE', {
          transactionId: id,
          deletedBy,
          itemSkus: item.items.map((i: any) => i.sku),
        }).catch(err => console.error(err));
      }
      await session.commitTransaction();
      return true;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // --- Outward Return Endpoints ---
  static async createOutwardReturn(data: any, createdBy: string) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const item = await OutwardReturn.create([data], { session });
      for (const it of data.items) {
        await this.updateStock("Outward Return", it.sku, it.itemName, it.qty, it.unit, data.category || "General", session);
      }
      await Transaction.create([{ ...data, type: "Outward Return" }], { session });
      await session.commitTransaction();

      triggerN8nWebhook('OUTWARD_RETURN', {
        transactionId: data.id,
        createdBy,
        items: data.items,
        project: data.project,
      }).catch(err => console.error(err));

      return item[0];
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  static async updateOutwardReturn(id: string, data: any, updatedBy: string) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const oldItem = await OutwardReturn.findOne({ id }).session(session);
      if (!oldItem) throw new Error("Outward Return not found");

      // Note: user requested no inventory changes when editing outward returns: "edit krne pr bhi inventory m changes nhi honge"
      const item = await OutwardReturn.findOneAndUpdate({ id }, data, { new: true, session });
      await Transaction.findOneAndUpdate({ id }, { ...data, type: "Outward Return" }, { session });
      await session.commitTransaction();

      triggerN8nWebhook('OUTWARD_RETURN_UPDATE', {
        transactionId: id,
        updatedBy,
        items: data.items,
        project: data.project,
      }).catch(err => console.error(err));

      return item;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  static async deleteOutwardReturn(id: string, deletedBy: string) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const item = await OutwardReturn.findOne({ id }).session(session);
      if (item) {
        // User requested: "delete krne pr wapas se inventory m add ho jyega"
        for (const it of item.items) {
          await this.updateStock("Outward Return", it.sku, it.itemName, -it.qty, it.unit, "General", session);
        }
        await OutwardReturn.findOneAndDelete({ id }).session(session);
        await Transaction.findOneAndDelete({ id }).session(session);

        triggerN8nWebhook('OUTWARD_RETURN_DELETE', {
          transactionId: id,
          deletedBy,
          itemSkus: item.items.map((i: any) => i.sku),
        }).catch(err => console.error(err));
      }
      await session.commitTransaction();
      return true;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // --- Gate Pass Availability ---
  static async getAvailableGatePasses() {
    const outwardTransfers = await Transaction.find({ type: 'Transfer Outward' }).lean();
    const inwardTransfers = await Transaction.find({ type: 'Transfer Inward' }).lean();
    
    const linkedGatePasses = new Set(inwardTransfers.map(it => it.gatePassNo).filter(Boolean));
    const available = outwardTransfers.filter(ot => ot.gatePassNo && !linkedGatePasses.has(ot.gatePassNo));
    
    return available;
  }
}
