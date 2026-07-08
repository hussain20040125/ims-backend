import mongoose, { Schema } from "mongoose";

const GSTRateSchema = new Schema({
  rate: { type: Number },
  label: { type: String },
}, { timestamps: true });

GSTRateSchema.index({ rate: 1 }, { unique: true, sparse: true });
GSTRateSchema.index({ label: 1 }, { unique: true, sparse: true });

export const GSTRate = mongoose.model("GSTRate", GSTRateSchema);
