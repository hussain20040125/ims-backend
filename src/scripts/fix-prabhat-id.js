/**
 * Fix PRABHAT INDUSTRIES id — assign the next proper VND number in series.
 * Run: node src/scripts/fix-prabhat-id.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) { console.error("MONGODB_URI not set"); process.exit(1); }

await mongoose.connect(MONGO_URI);
const vendors = mongoose.connection.db.collection("vendors");

// Find max VND number across ALL formats (VND-0001, VND_0001, VND0001, etc.)
const all = await vendors.find({}, { projection: { id: 1 } }).toArray();
let maxNum = 0;
for (const v of all) {
  const match = (v.id || "").replace(/[^a-zA-Z0-9]/g, "").match(/^VND(\d+)$/i);
  if (match) {
    const n = parseInt(match[1], 10);
    if (n > maxNum) maxNum = n;
  }
}
const nextId = `VND-${String(maxNum + 1).padStart(4, "0")}`;
console.log(`Max existing VND number: ${maxNum} → assigning ${nextId} to PRABHAT INDUSTRIES`);

const result = await vendors.updateOne(
  { companyName: "PRABHAT INDUSTRIES", id: "VND-0001" },
  { $set: { id: nextId, updatedAt: new Date() } }
);

if (result.matchedCount === 0) {
  console.error("PRABHAT INDUSTRIES with id VND-0001 not found. Check DB manually.");
} else {
  console.log(`✓ PRABHAT INDUSTRIES updated to ${nextId}`);
}

await mongoose.disconnect();
