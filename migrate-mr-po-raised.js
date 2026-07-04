// One-time migration: set status="PO Created" on all MRs that have an active PO
// Run: node migrate-mr-po-raised.js

import dotenv from "dotenv";
import mongoose from "mongoose";
import { PurchaseOrder, MaterialRequirement } from "./src/models/index.js";

dotenv.config();

const RELEASED = ["Rejected", "Blocked", "Cancelled"];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  // Get all active POs that have a mrId
  const activePOs = await PurchaseOrder.find(
    { mrId: { $exists: true, $ne: "" }, status: { $nin: RELEASED } },
    { mrId: 1, id: 1, status: 1 }
  ).lean();

  const mrIds = [...new Set(activePOs.map(p => p.mrId).filter(Boolean))];
  console.log(`Found ${activePOs.length} active POs across ${mrIds.length} unique MRs`);

  if (mrIds.length === 0) {
    console.log("Nothing to update.");
    await mongoose.disconnect();
    return;
  }

  // Only update MRs that are NOT already in a final/issued state
  const SKIP_STATUSES = ["Closed", "Partially Issued", "Issued", "Allocated", "Partially Allocated", "PO Created"];

  const result = await MaterialRequirement.updateMany(
    { id: { $in: mrIds }, status: { $nin: SKIP_STATUSES } },
    { $set: { status: "PO Created" } }
  );

  console.log(`Updated ${result.modifiedCount} MRs to "PO Created"`);
  console.log(`Already in final state (skipped): ${mrIds.length - result.modifiedCount}`);

  // Show which MRs were updated
  const updated = await MaterialRequirement.find(
    { id: { $in: mrIds }, status: "PO Created" },
    { id: 1, mrNumber: 1, project: 1 }
  ).lean();

  updated.forEach(m => console.log(`  ✓ ${m.mrNumber || m.id}  —  ${m.project || ""}`));

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch(err => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
