/**
 * One-time fix: consolidate duplicate GRN documents down to one per PO.
 *
 * Handles two patterns, per PO, via an explicit plan (no guessing at runtime):
 *   - fold:   a genuinely separate later delivery -> added as a shipment (receipts[])
 *             on the target GRN, with its received qty summed onto matching items.
 *   - dedupe: an exact re-entry of the same delivery (same challan, same qty) -> just
 *             discarded, WITHOUT adding its qty again (summing these would double-count).
 *
 * This intentionally only covers "Bucket A" (genuine sequential shipments) and
 * "Bucket B" (exact duplicates) from the investigation — NOT the 7 ambiguous
 * "Bucket C" POs (cumulative/corrected re-entries), which need a human read on what
 * actually happened before touching them.
 *
 * Run (preview only, no writes):
 *   node src/scripts/merge-grns-bucket-ab.js
 * Run (apply):
 *   APPLY=1 node src/scripts/merge-grns-bucket-ab.js
 */
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { GRN, Inward, Transaction } from "../models/index.js";

const APPLY = !!process.env.APPLY;

const PLAN = [
  // Bucket A — genuine sequential shipments (fold in as separate shipments, sum qty)
  { poId: "PO-2026-185", target: "GRN-2026-126", fold: ["GRN-2026-160", "GRN-2026-161", "GRN-2026-168", "GRN-2026-204"], dedupe: [] },
  { poId: "PO-2026-226", target: "GRN-2026-176", fold: ["GRN-2026-198"], dedupe: [] },
  { poId: "PO-2026-225", target: "GRN-2026-177", fold: ["GRN-2026-199"], dedupe: [] },
  { poId: "PO-2026-107", target: "GRN-2026-36",  fold: ["GRN-2026-102"], dedupe: [] },
  { poId: "PO-2026-258", target: "GRN-2026-209", fold: ["GRN-2026-210"], dedupe: [] },
  { poId: "PO-2026-137", target: "GRN-2026-148", fold: ["GRN-2026-166"], dedupe: [] },
  { poId: "PO-2026-320", target: "GRN-2026-266", fold: ["GRN-2026-317"], dedupe: [] },
  // Mixed: GRN-193 is an exact re-entry of GRN-119 (dedupe); GRN-202 is the genuine
  // follow-up delivery of the item GRN-119 was still short on (fold).
  { poId: "PO-2026-190", target: "GRN-2026-119", fold: ["GRN-2026-202"], dedupe: ["GRN-2026-193"] },

  // Bucket B — exact duplicates (same challan + identical items/qty, just re-entered)
  { poId: "PO-2026-207", target: "GRN-2026-187", fold: [], dedupe: ["GRN-2026-267"] },
  { poId: "PO-2026-241", target: "GRN-2026-171", fold: [], dedupe: ["GRN-2026-225"] },
  { poId: "PO-2026-279", target: "GRN-2026-254", fold: [], dedupe: ["GRN-2026-265"] },
  { poId: "PO-2026-267", target: "GRN-2026-206", fold: [], dedupe: ["GRN-2026-270"] },
  { poId: "PO-2026-72",  target: "GRN-2026-164", fold: [], dedupe: ["GRN-2026-249"] },
  { poId: "PO-2026-203", target: "GRN-2026-190", fold: [], dedupe: ["GRN-2026-243"] },
  { poId: "PO-2026-222", target: "GRN-2026-178", fold: [], dedupe: ["GRN-2026-252"] },
  { poId: "PO-2026-264", target: "GRN-2026-219", fold: [], dedupe: ["GRN-2026-263"] },
];

function computeStatus(items) {
  const hasShortage = items.some((i) => (i.received || 0) < (i.ordered || 0));
  const hasExcess = items.some((i) => (i.received || 0) > (i.ordered || 0));
  return hasShortage ? "Partial" : hasExcess ? "Over-Received" : "Confirmed";
}

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
      sku: i.sku, itemName: i.itemName, received: i.received || 0, images: i.images || [],
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
      sku, itemName: srcItem?.itemName, ordered: srcItem?.ordered || 0, received,
      variance: received - (srcItem?.ordered || 0), unit: srcItem?.unit, condition: srcItem?.condition,
      images: srcItem?.images || [],
    });
  });
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to MongoDB${APPLY ? "" : " (PREVIEW ONLY — pass APPLY=1 to write)"}\n`);

  for (const plan of PLAN) {
    const target = await GRN.findOne({ id: plan.target });
    if (!target) { console.log(`SKIP ${plan.poId}: target ${plan.target} not found`); continue; }
    if (target.poId !== plan.poId) { console.log(`SKIP ${plan.poId}: target ${plan.target} has poId=${target.poId}, expected ${plan.poId}`); continue; }

    const foldDocs = [];
    for (const id of plan.fold) {
      const d = await GRN.findOne({ id });
      if (!d) { console.log(`SKIP ${plan.poId}: fold doc ${id} not found`); continue; }
      if (d.poId !== plan.poId) { console.log(`SKIP ${plan.poId}: fold doc ${id} has poId=${d.poId}, expected ${plan.poId}`); continue; }
      foldDocs.push(d);
    }
    const dedupeDocs = [];
    for (const id of plan.dedupe) {
      const d = await GRN.findOne({ id });
      if (!d) { console.log(`SKIP ${plan.poId}: dedupe doc ${id} not found`); continue; }
      if (d.poId !== plan.poId) { console.log(`SKIP ${plan.poId}: dedupe doc ${id} has poId=${d.poId}, expected ${plan.poId}`); continue; }
      dedupeDocs.push(d);
    }

    console.log(`--- ${plan.poId}: target=${plan.target} | fold=[${foldDocs.map(d => d.id).join(", ")}] | dedupe(discard, no qty change)=[${dedupeDocs.map(d => d.id).join(", ")}] ---`);

    const targetItems = target.items.map((i) => (i.toObject ? i.toObject() : { ...i }));
    const targetReceipts = (target.receipts || []).map((r) => (r.toObject ? r.toObject() : { ...r }));
    for (const d of foldDocs) foldIn(d, targetItems, targetReceipts);
    const newStatus = computeStatus(targetItems);

    console.log(`  ${plan.target} status: ${target.status} -> ${newStatus}`);
    console.log(`  ${plan.target} items:`, targetItems.map((i) => `${i.sku}:${i.received}/${i.ordered}`));
    console.log(`  ${plan.target} shipments: ${targetReceipts.length}`);

    if (!APPLY) { console.log(); continue; }

    target.items = targetItems;
    target.receipts = targetReceipts;
    target.status = newStatus;
    target.markModified("items");
    target.markModified("receipts");
    await target.save();

    for (const d of [...foldDocs, ...dedupeDocs]) {
      const inwardRes = await Inward.updateMany({ grnRef: d.id }, { grnRef: target.id });
      const trxRes = await Transaction.updateMany({ linkId: d.id }, { linkId: target.id });
      await GRN.deleteOne({ id: d.id });
      console.log(`  Removed ${d.id} -> merged into ${target.id} (re-pointed ${inwardRes.modifiedCount} Inward, ${trxRes.modifiedCount} Transaction record(s))`);
    }
    console.log();
  }

  console.log(`Done${APPLY ? "" : " (preview only — nothing was written; re-run with APPLY=1 to apply)"}.`);
  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
