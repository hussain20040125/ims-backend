/**
 * One-time migration: copy account/payment data from purchaseorders → accounts collection
 * Run: node src/scripts/migrate-accounts.js
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { PurchaseOrder, AccountEntry, Counter } from "../models/index.js";

async function getNextSeq(name) {
  const c = await Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true }
  );
  return c.seq;
}

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const ACCOUNT_STATUSES = ["bill_verify", "payment_pending", "partial_paid", "paid", "rejected"];
  const GRN_STATUSES = ["GRN Fulfilled", "GRN Variance", "Ready for Payment", "PO Closed"];

  // All POs that have any account activity
  const pos = await PurchaseOrder.find({
    $or: [
      { accountStatus: { $in: ACCOUNT_STATUSES } },
      { status: { $in: GRN_STATUSES } },
    ],
  }).lean();

  console.log(`Found ${pos.length} POs to migrate`);

  let created = 0;
  let skipped = 0;
  const year = new Date().getFullYear();

  for (const po of pos) {
    // Skip if account already exists for this PO
    const existing = await AccountEntry.findOne({ poId: po.id });
    if (existing) {
      skipped++;
      continue;
    }

    const seq = await getNextSeq("account");
    const id = `ACC-${year}-${String(seq).padStart(3, "0")}`;

    const accountStatus = po.accountStatus || "bill_verify";

    await AccountEntry.create({
      id,
      poId: po.id,
      project: po.project,
      supplier: po.supplier,
      accountStatus,

      invoice: po.invoice || undefined,

      billApprovedBy: po.billApprovedBy,
      billApprovedAt: po.billApprovedDate,
      billRejectedBy: po.billRejectedBy,
      billRejectedAt: po.billRejectedDate,
      rejectionReason: po.rejectionReason,

      totalPaid: po.totalPaid || po.payment?.amountPaid || 0,
      poTotalValue: po.totalValue,

      paymentHistory: po.paymentHistory || [],
      payment: po.payment || undefined,
      auditTrail: po.auditTrail || [],
    });

    console.log(`  ✓ Created ACC-${year}-${String(seq).padStart(3, "0")} for PO ${po.id} [${accountStatus}]`);
    created++;
  }

  console.log(`\nMigration complete: ${created} created, ${skipped} already existed`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
