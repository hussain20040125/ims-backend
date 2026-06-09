import { Router } from "express";
import { AuditLog } from "../models/index.js";
import { authenticate } from "../middleware/auth.middleware.js";
const router = Router();
router.get("/", authenticate, async (req, res) => {
  try {
    const roleLower = (req.user?.role || "").toLowerCase().trim();
    const isAdmin = ["super admin", "superadmin", "admin"].includes(roleLower);
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, parseInt(req.query.limit) || 100);
    const skip = (page - 1) * limit;
    const search = (req.query.search || "").trim();
    const userFilter = (req.query.user || "").trim();
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    
    let query = {};
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [
        { userName: re },
        { userEmail: re },
        { action: re },
        { resource: re },
        { resourceId: re }
      ];
    }
    
    if (userFilter) {
      query.userName = userFilter;
    }
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }
    const [data, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(query)
    ]);
    res.json({ success: true, data, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
var stdin_default = router;
export {
  stdin_default as default
};
