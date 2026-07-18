/**
 * Backfill grnReceivedValue + payableAmount + grnIds on existing Account entries
 * Run: node src/scripts/backfill-grn-values.js
 */
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { AccountEntry, GRN, PurchaseOrder } from "../models/index.js";

async function backfill() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected");

  const accounts = await AccountEntry.find({}).lean();
  console.log(`Backfilling ${accounts.length} accounts...`);

  let updated = 0;
  for (const acc of accounts) {
    const po = await PurchaseOrder.findOne({ id: acc.poId }).lean();
    const grns = await GRN.find({ poId: acc.poId }).lean();

    if (!grns.length) continue;

    const grnIds = grns.map(g => g.id);
    const grnReceivedValue = grns.reduce((total, grn) => {
      return total + grn.items.reduce((sum, gi) => {
        const rcv = gi.received ?? gi.qty ?? 0;
        const poItem = (po?.items || []).find(pi =>
          (pi.sku && gi.sku && pi.sku === gi.sku) ||
          (pi.materialName || "").toLowerCase() === (gi.itemName || "").toLowerCase()
        );
        const rate = gi.rate || poItem?.rate || 0;
        return sum + rcv * rate;
      }, 0);
    }, 0);

    const totalPaid = acc.totalPaid || acc.payment?.amountPaid || 0;
    const payableAmount = Math.max(0, grnReceivedValue - totalPaid);

    await AccountEntry.updateOne({ _id: acc._id }, {
      $set: {
        grnIds,
        grnReceivedValue: Math.round(grnReceivedValue * 100) / 100,
        payableAmount: Math.round(payableAmount * 100) / 100,
        poStatus: po?.status,
        poTotalValue: acc.poTotalValue || po?.totalValue,
      }
    });

    console.log(`  ✓ ${acc.id} (${acc.poId}): GRN value ₹${grnReceivedValue.toFixed(2)}, payable ₹${payableAmount.toFixed(2)}`);
    updated++;
  }

  console.log(`\nDone: ${updated} accounts backfilled`);
  await mongoose.disconnect();
}

backfill().catch(err => { console.error(err); process.exit(1); });
