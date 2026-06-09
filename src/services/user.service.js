var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import { logger } from "../utils/logger.js";
import bcrypt from "bcryptjs";
import { User, RolePermission } from "../models/index.js";
import { triggerN8nWebhook } from "../utils/webhook.js";
class UserService {
  static {
    __name(this, "UserService");
  }
  static async getAll() {
    const users = await User.find().sort({ createdAt: -1 });
    const mapped = [];
    for (const u of users) {
      const rp = await RolePermission.findOne({ role: u.role });
      const obj = u.toObject();
      obj.rolePermissions = rp ? rp.permissions : [];
      mapped.push(obj);
    }
    return mapped;
  }
  static async create(data, createdBy) {
    if (!data.email || !data.password) {
      throw new Error("Email and password are required");
    }
    const exists = await User.findOne({ email: data.email });
    if (exists) {
      throw new Error("Email is already registered");
    }
    const plainPassword = data.password;
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await User.create({
      ...data,
      password: hashedPassword,
      plainPassword,
      isActive: data.isActive !== void 0 ? data.isActive : true,
      status: data.status || "Active"
    });
    triggerN8nWebhook("USER_CREATE", {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      createdBy
    }).catch((err) => logger.error("[UserService] User create webhook failed:", err));
    const rp = await RolePermission.findOne({ role: user.role });
    const obj = user.toObject();
    obj.rolePermissions = rp ? rp.permissions : [];
    return obj;
  }
  static async update(id, data, updatedBy) {
    const updatePayload = { ...data };
    if (updatePayload.password) {
      updatePayload.plainPassword = updatePayload.password;
      updatePayload.password = await bcrypt.hash(updatePayload.password, 10);
    } else {
      delete updatePayload.password;
    }
    if (updatePayload.status) {
      updatePayload.isActive = updatePayload.status === "Active";
    } else if (updatePayload.isActive !== void 0) {
      updatePayload.status = updatePayload.isActive ? "Active" : "Inactive";
    }
    const user = await User.findByIdAndUpdate(id, { $set: updatePayload }, { returnDocument: 'after' });
    if (!user) {
      throw new Error("User not found");
    }
    triggerN8nWebhook("USER_UPDATE", {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      updatedBy
    }).catch((err) => logger.error("[UserService] User update webhook failed:", err));
    const rp = await RolePermission.findOne({ role: user.role });
    const obj = user.toObject();
    obj.rolePermissions = rp ? rp.permissions : [];
    return obj;
  }
  static async delete(id, deletedBy) {
    const user = await User.findById(id);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.role.toLowerCase() === "super admin" || user.role.toLowerCase() === "superadmin") {
      throw new Error("Cannot delete a Super Admin user");
    }
    await User.findByIdAndDelete(id);
    triggerN8nWebhook("USER_DELETE", {
      userId: id,
      email: user.email,
      name: user.name,
      deletedBy
    }).catch((err) => logger.error("[UserService] User delete webhook failed:", err));
    return true;
  }
  static async changePassword(userId, currentPass, newPass) {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");
    const match = await bcrypt.compare(currentPass, user.password);
    if (!match) throw new Error("Incorrect current password");
    user.password = await bcrypt.hash(newPass, 10);
    await user.save();
    return true;
  }
}
export {
  UserService
};
