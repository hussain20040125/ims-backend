/**
 * One-time fix: merge ALL duplicate GRNs (multiple GRN documents sharing the same
 * poId) into a single GRN per PO, with every extra delivery folded in as a shipment
 * (receipts[]) on the earliest one — same approach as merge-grn-193-202.js, just
 * applied across every PO that has this problem instead of one specific pair.
 *
 * Root cause: see GRN.jsx handlePOSelect fix — a second delivery against a PO could
 * create a brand-new GRN document instead of being added as a shipment on the
 * existing one.
 *
 * Run (preview only, no writes):
 *   DRY_RUN=1 node src/scripts/merge-duplicate-grns.js
 * Run (apply):
 *   node src/scripts/merge-duplicate-grns.js
 */
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { GRN, Inward, Transaction } from "../models/index.js";

const DRY_RUN = !!process.env.DRY_RUN;

function computeStatus(items) {
  const hasShortage = items.some((i) => (i.received || 0) < (i.ordered || 0));
  const hasExcess = items.some((i) => (i.received || 0) > (i.ordered || 0));
  return hasShortage ? "Partial" : hasExcess ? "Over-Received" : "Confirmed";
}

// Fold `source` GRN's delivery + any shipments it already had into `targetItems`/`targetReceipts`
function foldIn(source, targetItems, targetReceipts) {
  const receipt = {
    date: source.date,
    challan: source.challan,
    mrNo: source.mrNo,
    docType: source.docType,
    personName: source.personName,
    challanPhotos: source.challanPhotos || [],
    personPhotos: source.personPhotos || [],
    items: (source.items || []).map((i) => ({
      sku: i.sku,
      itemName: i.itemName,
      received: i.received || 0,
      images: i.images || [],
    })),
  };
  targetReceipts.push(receipt);
  (source.receipts || []).forEach((r) => targetReceipts.push(r.toObject ? r.toObject() : { ...r }));

  const addedBySku = {};
  (source.items || []).forEach((i) => { addedBySku[i.sku] = (addedBySku[i.sku] || 0) + (i.received || 0); });

  targetItems.forEach((item) => {
    const added = addedBySku[item.sku] || 0;
    delete addedBySku[item.sku];
    item.received = (item.received || 0) + added;
    item.variance = item.received - (item.ordered || 0);
  });
  Object.entries(addedBySku).forEach(([sku, received]) => {
    const srcItem = (source.items || []).find((i) => i.sku === sku);
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
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to MongoDB${DRY_RUN ? " (DRY RUN — no writes will be made)" : ""}`);

  const dupGroups = await GRN.aggregate([
    { $group: { _id: "$poId", count: { $sum: 1 }, ids: { $push: "$id" } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  console.log(`Found ${dupGroups.length} PO(s) with duplicate GRN documents.\n`);

  let mergedCount = 0;
  for (const group of dupGroups) {
    const poId = group._id;
    const docs = await GRN.find({ poId }).sort({ date: 1, createdAt: 1 });
    if (docs.length < 2) continue;

    const [target, ...sources] = docs;
    console.log(`--- ${poId}: merging [${sources.map(s => s.id).join(", ")}] into ${target.id} ---`);

    const targetItems = target.items.map((i) => (i.toObject ? i.toObject() : { ...i }));
    const targetReceipts = (target.receipts || []).map((r) => (r.toObject ? r.toObject() : { ...r }));

    for (const source of sources) {
      foldIn(source, targetItems, targetReceipts);
    }

    const newStatus = computeStatus(targetItems);

    if (DRY_RUN) {
      console.log(`  Would set ${target.id} status: ${target.status} -> ${newStatus}`);
      console.log(`  Would set ${target.id} items:`, targetItems.map(i => `${i.sku}:${i.received}/${i.ordered}`));
      console.log(`  Would set ${target.id} shipments: ${targetReceipts.length}`);
      console.log(`  Would delete: ${sources.map(s => s.id).join(", ")}\n`);
      mergedCount++;
      continue;
    }

    target.items = targetItems;
    target.receipts = targetReceipts;
    target.status = newStatus;
    target.markModified("items");
    target.markModified("receipts");
    await target.save();

    for (const source of sources) {
      const inwardRes = await Inward.updateMany({ grnRef: source.id }, { grnRef: target.id });
      const trxRes = await Transaction.updateMany({ linkId: source.id }, { linkId: target.id });
      await GRN.deleteOne({ id: source.id });
      console.log(`  Merged ${source.id} -> ${target.id} (re-pointed ${inwardRes.modifiedCount} Inward, ${trxRes.modifiedCount} Transaction record(s))`);
    }
    console.log(`  ${target.id} new status: ${newStatus}, shipments: ${targetReceipts.length}\n`);
    mergedCount++;
  }

  console.log(`\nDone. ${mergedCount} PO(s) ${DRY_RUN ? "would be" : "were"} merged down to a single GRN.`);
  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
