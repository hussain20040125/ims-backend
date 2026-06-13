import mongoose, { Schema } from "mongoose";

const NotificationSchema = new Schema({
  id:          { type: String, required: true, unique: true },
  message:     { type: String, required: true },
  severity:    { type: String, enum: ["info","success","warning","error"], default: "info" },
  senderId:    { type: Schema.Types.ObjectId, ref: "User" },
  readBy:      [{ type: Schema.Types.ObjectId, ref: "User" }],
  targetRoles: { type: [String], default: [] },
  type:        { type: String, default: "NOTIFICATION" },
  path:        String,
}, { timestamps: true });

NotificationSchema.index({ createdAt: -1 });

export const Notification = mongoose.model("Notification", NotificationSchema);
