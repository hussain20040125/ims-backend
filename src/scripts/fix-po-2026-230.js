/**
 * One-time fix: reset corrupted payment fields on PO-2026-230
 * Run: node src/scripts/fix-po-2026-230.js
 *
 * Root cause: handleDeletePayment previously only sent { accountStatus, payment },
 * leaving totalPaid and paymentHistory with stale data in MongoDB.
 */
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { PurchaseOrder } from "../models/index.js";

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const po = await PurchaseOrder.findOne({ id: "PO-2026-230" });
  if (!po) {
    console.error("PO-2026-230 not found");
    await mongoose.disconnect();
    return;
  }

  console.log("Before fix:");
  console.log("  accountStatus:", po.accountStatus);
  console.log("  totalPaid:", po.totalPaid);
  console.log("  paymentHistory length:", po.paymentHistory?.length ?? 0);
  console.log("  po.status:", po.status);

  po.accountStatus = null;
  po.totalPaid = 0;
  po.paymentHistory = [];
  po.payment = null;

  // markModified required for Mixed/Array types
  po.markModified("accountStatus");
  po.markModified("totalPaid");
  po.markModified("paymentHistory");
  po.markModified("payment");

  await po.save();

  console.log("\nAfter fix:");
  const updated = await PurchaseOrder.findOne({ id: "PO-2026-230" }).lean();
  console.log("  accountStatus:", updated.accountStatus);
  console.log("  totalPaid:", updated.totalPaid);
  console.log("  paymentHistory length:", updated.paymentHistory?.length ?? 0);
  console.log("\nDone. PO-2026-230 reset — bill verification will re-activate.");

  await mongoose.disconnect();
}

fix().catch(err => { console.error(err); process.exit(1); });
