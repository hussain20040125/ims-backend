import { Router } from "express";
import { Notification } from "../models/index.js";
import { authenticate } from "../middleware/auth.middleware.js";
const router = Router();
router.get("/", authenticate, async (req, res) => {
  try {
    const query = {};
    if (req.user.role !== "Super Admin" && req.user.role !== "admin") {
      query.targetRoles = { $in: [req.user.role] };
    }
    const notifications = await Notification.find(query).sort({ createdAt: -1 }).limit(100);
    const mapped = notifications.map((n) => ({
      ...n.toObject(),
      read: n.readBy?.some((id) => id.toString() === req.user._id.toString()) || false
    }));
    res.json({ success: true, data: mapped });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
router.post("/:id/read", authenticate, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { id: req.params.id },
      { $addToSet: { readBy: req.user._id } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
router.post("/read-all", authenticate, async (req, res) => {
  try {
    await Notification.updateMany({}, { $addToSet: { readBy: req.user._id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
var stdin_default = router;
export {
  stdin_default as default
};
