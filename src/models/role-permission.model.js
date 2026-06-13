import mongoose, { Schema } from "mongoose";

const RolePermissionSchema = new Schema({
  role:        { type: String, required: true, unique: true },
  permissions: { type: [String], default: [] },
}, { timestamps: true });

RolePermissionSchema.index({ permissions: 1 });

export const RolePermission = mongoose.model("RolePermission", RolePermissionSchema);
