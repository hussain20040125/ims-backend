var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import { logger } from "./logger.js";
import { AuditLog } from "../models/index.js";
const logAudit = /* @__PURE__ */ __name((user, action, resource, resourceId, details) => {
  if (!user) return;
  AuditLog.create({
    userId: user._id,
    userName: user.name || "Unknown",
    userEmail: user.email || "",
    action,
    resource,
    resourceId,
    details
  }).catch((err) => logger.error("[Audit] Failed to write log:", err));
}, "logAudit");
export {
  logAudit
};
