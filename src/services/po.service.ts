import mongoose from 'mongoose';
import { GRN, Inward, Transaction, Outward, PurchaseOrder, MaterialRequirement } from '../models/index.js';
import { broadcast } from '../utils/broadcaster.js';

export class POService {
  static async cascadeDeletePO(poId: string, session?: mongoose.ClientSession) {
    // 1. Delete associated GRNs and their Inwards
    const grns = await GRN.find({ poId }).session(session || null);
    for (const grn of grns) {
      await Inward.deleteMany({ grnRef: grn.id }).session(session || null);
      await GRN.deleteOne({ id: grn.id }).session(session || null);
    }
    // 2. Delete associated Transactions
    await Transaction.deleteMany({ poId }).session(session || null);
    // 3. Delete associated Outwards
    await Outward.deleteMany({ poId }).session(session || null);
    // 4. Update parent MR if exists (reset status and approvedQuotationId to allow re-quoting/deletion)
    const po = await PurchaseOrder.findOne({ id: poId }).session(session || null);
    if (po && po.mrId) {
      // Check if other POs still exist for this MR (partial POs)
      const otherPOs = await PurchaseOrder.find({ mrId: po.mrId, id: { $ne: poId } }).session(session || null);
      if (otherPOs.length === 0) {
        await MaterialRequirement.updateOne(
          { id: po.mrId },
          { 
            $set: { 
              status: 'Approved by AGM', 
              approvedQuotationId: '', 
              approvedSupplier: '' 
            } 
          }
        ).session(session || null);
        broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });
      }
    }

    // 5. Delete the PO itself
    await PurchaseOrder.deleteOne({ id: poId }).session(session || null);
  }
}
