/**
 * One-time fix: merge duplicate GRN-2026-202 into GRN-2026-193 (both for PO-2026-190)
 * Run: node src/scripts/merge-grn-193-202.js
 *
 * Root cause: a second delivery against PO-2026-190 created a brand-new GRN document
 * (GRN-2026-202) instead of being added as a shipment on the existing Partial GRN
 * (GRN-2026-193) — see GRN.jsx handlePOSelect fix. This script merges the two so the
 * PO shows a single GRN entry with both deliveries recorded as shipments.
 */
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { GRN } from "../models/index.js";
import { Inward, Transaction } from "../models/index.js";

const TARGET_ID = "GRN-2026-193"; // surviving GRN (currently Partial)
const SOURCE_ID = "GRN-2026-202"; // duplicate GRN to merge in and remove
const EXPECTED_PO = "PO-2026-190";

async function merge() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const target = await GRN.findOne({ id: TARGET_ID });
  const source = await GRN.findOne({ id: SOURCE_ID });

  if (!target) throw new Error(`${TARGET_ID} not found`);
  if (!source) throw new Error(`${SOURCE_ID} not found`);
  if (target.poId !== EXPECTED_PO || source.poId !== EXPECTED_PO) {
    throw new Error(`PO mismatch: target.poId=${target.poId}, source.poId=${source.poId}, expected ${EXPECTED_PO}`);
  }

  console.log("\nBefore merge:");
  console.log(` ${TARGET_ID} status=${target.status} items=`, target.items.map(i => `${i.sku}:${i.received}/${i.ordered}`));
  console.log(` ${SOURCE_ID} status=${source.status} items=`, source.items.map(i => `${i.sku}:${i.received}/${i.ordered}`));

  // 1. Build a shipment/receipt entry from the source GRN's own delivery
  const receipt = {
    date: source.date,
    challan: source.challan,
    mrNo: source.mrNo,
    docType: source.docType,
    personName: source.personName,
    challanPhotos: source.challanPhotos || [],
    personPhotos: source.personPhotos || [],
    items: source.items.map((i) => ({
      sku: i.sku,
      itemName: i.itemName,
      received: i.received || 0,
      images: i.images || [],
    })),
  };
  // Also fold in any shipments the source GRN already had of its own
  const sourceReceipts = (source.receipts || []).map((r) => (r.toObject ? r.toObject() : { ...r }));

  target.receipts = [...(target.receipts || []), receipt, ...sourceReceipts];

  // 2. Accumulate received qty from the source GRN's items onto the target's items (match by sku)
  const addedBySku = {};
  source.items.forEach((i) => { addedBySku[i.sku] = (addedBySku[i.sku] || 0) + (i.received || 0); });

  const targetItems = target.items.map((item) => {
    const obj = item.toObject ? item.toObject() : { ...item };
    const added = addedBySku[obj.sku] || 0;
    delete addedBySku[obj.sku];
    const totalReceived = (obj.received || 0) + added;
    return { ...obj, received: totalReceived, variance: totalReceived - (obj.ordered || 0) };
  });
  // Any source SKUs the target didn't already have an item row for (shouldn't normally happen
  // for a same-PO split, but handled for safety)
  Object.entries(addedBySku).forEach(([sku, received]) => {
    const srcItem = source.items.find((i) => i.sku === sku);
    targetItems.push({
      sku,
      itemName: srcItem?.itemName,
      ordered: srcItem?.ordered || 0,
      received,
      variance: received - (srcItem?.ordered || 0),
      unit: srcItem?.unit,
      condition: srcItem?.condition,
      images: srcItem?.images || [],
    });
  });
  target.items = targetItems;
  target.markModified("items");
  target.markModified("receipts");

  // 3. Recompute status the same way the receipt-add route does
  const hasShortage = target.items.some((i) => (i.received || 0) < (i.ordered || 0));
  const hasExcess = target.items.some((i) => (i.received || 0) > (i.ordered || 0));
  target.status = hasShortage ? "Partial" : hasExcess ? "Over-Received" : "Confirmed";

  await target.save();
  console.log(`\n${TARGET_ID} merged and saved. New status=${target.status}`);
  console.log(` items=`, target.items.map(i => `${i.sku}:${i.received}/${i.ordered}`));
  console.log(` shipments=${target.receipts.length}`);

  // 4. Re-point Inward/Transaction records that referenced the now-removed source GRN,
  //    instead of deleting them, so the historical delivery record is preserved.
  const inwardRes = await Inward.updateMany({ grnRef: SOURCE_ID }, { grnRef: TARGET_ID });
  const trxRes = await Transaction.updateMany({ linkId: SOURCE_ID }, { linkId: TARGET_ID });
  console.log(`\nRe-pointed ${inwardRes.modifiedCount} Inward record(s) and ${trxRes.modifiedCount} Transaction record(s) from ${SOURCE_ID} to ${TARGET_ID}`);

  // 5. Remove the now-merged duplicate GRN document
  await GRN.deleteOne({ id: SOURCE_ID });
  console.log(`Deleted duplicate GRN document ${SOURCE_ID}`);

  console.log("\nDone.");
  await mongoose.disconnect();
}

merge().catch((err) => { console.error(err); process.exit(1); });
