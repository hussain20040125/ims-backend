import mongoose, { Schema } from "mongoose";

const AuditLogSchema = new Schema({
  userId:    { type: Schema.Types.ObjectId, ref: "User", required: true },
  userName:  String,
  userEmail: String,
  action:    { type: String, required: true },
  resource:  { type: String, required: true },
  resourceId: String,
  details:   Schema.Types.Map,
}, { timestamps: true });

export const AuditLog = mongoose.model("AuditLog", AuditLogSchema);
