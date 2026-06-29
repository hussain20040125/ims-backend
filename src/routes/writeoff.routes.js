import { Router } from "express";
import { createCrudRoutes } from "../utils/crud.js";
import { WriteOff, Inventory } from "../models/index.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { broadcast } from "../utils/broadcaster.js";
import { logAudit } from "../utils/audit.js";
import { createNotification } from "../utils/notification.js";

const router = Router();

// GET / and GET /:id use the generic CRUD router
const crudRouter = Router();
createCrudRoutes(crudRouter, WriteOff, "writeoffs", "id", void 0, "WRITEOFF");

// Mount only GET routes from crudRouter; POST and DELETE come from crudRouter too.
// We override PUT here to handle inventory on approval.
router.get("/", (req, res, next) => crudRouter.handle(req, res, next));
router.get("/:id", (req, res, next) => crudRouter.handle(req, res, next));
router.post("/", (req, res, next) => crudRouter.handle(req, res, next));
router.delete("/:id", (req, res, next) => crudRouter.handle(req, res, next));

router.put("/:id", authenticate, async (req, res) => {
  try {
    const writeoff = await WriteOff.findOne({ id: req.params.id });
    if (!writeoff) return res.status(404).json({ success: false, message: "Write-off not found" });

    const previousStatus = writeoff.status;
    const newStatus = req.body.status;

    Object.assign(writeoff, req.body);
    await writeoff.save();

    // Inventory adjustment on status transition
    if (previousStatus !== newStatus) {
      const inv = await Inventory.findOne({ sku: writeoff.sku });

      if (newStatus === "Approved" && previousStatus !== "Approved") {
        // Deduct stock on approval
        if (inv) {
          if (inv.availableQty < writeoff.qty) {
            // Rollback the status change and reject
            writeoff.status = previousStatus;
            await writeoff.save();
            return res.status(400).json({
              success: false,
              message: `Insufficient stock for write-off. Available: ${inv.availableQty}, Write-off qty: ${writeoff.qty}`
            });
          }
          inv.totalQty = Math.max(0, (inv.totalQty || 0) - writeoff.qty);
          inv.availableQty = Math.max(0, (inv.availableQty || 0) - writeoff.qty);
          inv.liveStock = (inv.availableQty || 0) + (inv.allocatedQty || 0);
          await inv.save();
        }
      } else if (previousStatus === "Approved" && newStatus !== "Approved") {
        // Restore stock if approval is reversed (e.g., Approved → Rejected)
        if (inv) {
          inv.totalQty = (inv.totalQty || 0) + writeoff.qty;
          inv.availableQty = (inv.availableQty || 0) + writeoff.qty;
          inv.liveStock = (inv.availableQty || 0) + (inv.allocatedQty || 0);
          await inv.save();
        }
      }
    }

    logAudit(req.user, "UPDATE", "writeoffs", writeoff.id, {
      from: previousStatus,
      to: newStatus
    });

    if (previousStatus !== newStatus) {
      await createNotification({
        message: `Write-off ${writeoff.id} status changed to ${newStatus} by ${req.user.name}`,
        severity: newStatus === "Approved" ? "warning" : "info",
        path: "writeoffs",
        senderId: req.user._id
      });
    }

    broadcast({ type: "DATA_UPDATED", path: "writeoffs" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });

    res.json({ success: true, data: writeoff });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

var stdin_default = router;
export { stdin_default as default };
