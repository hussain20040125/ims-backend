import mongoose, { Schema } from "mongoose";

const GSTRateSchema = new Schema({
  rate: { type: Number, required: true, unique: true },
}, { timestamps: true });

export const GSTRate = mongoose.model("GSTRate", GSTRateSchema);
