import { Router } from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { User } from "../models/index.js";
import { authenticate, serverHasPermission } from "../middleware/auth.middleware.js";
import { broadcast } from "../utils/broadcaster.js";
import { triggerN8nWebhook } from "../utils/webhook.js";
import { logAudit } from "../utils/audit.js";
const router = Router();
router.get("/", authenticate, async (req, res) => {
  if (!await serverHasPermission(req.user, "MANAGE_USERS")) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  try {
    const users = await User.find().select("-password");
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
router.post("/", authenticate, async (req, res) => {
  if (!await serverHasPermission(req.user, "MANAGE_USERS")) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  try {
    const { password, ...rest } = req.body;
    const userCount = await User.countDocuments();
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      ...rest,
      password: hashedPassword,
      plainPassword: password,
      role: userCount === 0 ? "Super Admin" : rest.role || "staff"
    });
    broadcast({ type: "DATA_UPDATED", path: "users" });
    logAudit(req.user, "CREATE", "User", user._id.toString(), { name: user.name, email: user.email, role: user.role });
    await triggerN8nWebhook("USER_CREATE", {
      userId: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      createdBy: req.user.name
    });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});
router.patch("/:id", authenticate, async (req, res) => {
  if (!await serverHasPermission(req.user, "MANAGE_USERS")) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  try {
    const { password, ...rest } = req.body;
    let updateData = { ...rest };
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
      updateData.plainPassword = password;
    }
    const user = await User.findByIdAndUpdate(req.params.id, updateData, { returnDocument: 'after' }).select("-password");
    broadcast({ type: "DATA_UPDATED", path: "users" });
    logAudit(req.user, "UPDATE", "User", req.params.id, { changedFields: Object.keys(rest) });
    await triggerN8nWebhook("USER_UPDATE", {
      userId: req.params.id,
      name: user?.name,
      email: user?.email,
      role: user?.role,
      updatedBy: req.user.name,
      changedFields: Object.keys(rest)
    });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});
router.delete("/:id", authenticate, async (req, res) => {
  if (!await serverHasPermission(req.user, "MANAGE_USERS")) {
    return res.status(403).json({ success: false, message: "Forbidden: You do not have MANAGE_USERS permission" });
  }
  const { id } = req.params;
  if (!id || id === "undefined") {
    return res.status(400).json({ success: false, message: "Invalid User ID" });
  }
  try {
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { _id: id };
    const userToDelete = await User.findOne(query).select("-password");
    if (!userToDelete) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    await User.deleteOne({ _id: id });
    broadcast({ type: "DATA_UPDATED", path: "users" });
    logAudit(req.user, "DELETE", "User", id, { name: userToDelete.name, email: userToDelete.email, role: userToDelete.role });
    triggerN8nWebhook("USER_DELETE", {
      userId: id,
      name: userToDelete.name,
      email: userToDelete.email,
      role: userToDelete.role,
      deletedBy: req.user.name
    }).catch((err) => console.error("[WEBHOOK] USER_DELETE failed:", err));
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});
var stdin_default = router;
export {
  stdin_default as default
};
