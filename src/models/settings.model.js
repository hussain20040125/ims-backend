import mongoose, { Schema } from "mongoose";

const SettingsSchema = new Schema({
  poThreshold:    { type: Number, default: 25000 },
  minQuotesLow:   { type: Number, default: 2 },
  minQuotesHigh:  { type: Number, default: 3 },
  projects:       { type: [String], default: [] },
  requesters:     { type: [String], default: [] },
  categories:     { type: [String], default: [] },
  units:          { type: [String], default: [] },
  workTypes:      { type: [String], default: [] },
  companies:      [{ name: String, gstin: String, address: String }],
  appName:        { type: String, default: "Garden City" },
  companyFullName:{ type: String, default: "Neoteric Properties" },
  footerText:     { type: String, default: "" },
  logoUrl:        { type: String, default: "" },
  faviconUrl:     { type: String, default: "" },
  themeColor:     { type: String, default: "#F97316" },
  fontFamily:     { type: String, default: "Inter" },
  approvers: {
    purchaseCoord: { type: String, default: "Vijay Kushwah" },
    l1:            { type: String, default: "Akhilesh Singh" },
    l2:            { type: String, default: "Jinesh Jain" },
    l3:            { type: String, default: "Rahul Gupta" },
  },
  bypassApprovals: {
    l1: { type: Boolean, default: false },
    l2: { type: Boolean, default: false },
    l3: { type: Boolean, default: false },
  },
  stores:    { type: [String], default: [] },
  gstRates:  { type: [String], default: ["0%", "5%", "12%", "18%", "28%"] },
}, { timestamps: true });

export const Settings = mongoose.model("Settings", SettingsSchema);
