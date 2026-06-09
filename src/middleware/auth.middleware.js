var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import jwt from "jsonwebtoken";
import { User, RolePermission } from "../models/index.js";
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV !== "production" ? "dev-only-secret" : "");
const authenticate = /* @__PURE__ */ __name(async (req, res, next) => {
  let token = req.headers.authorization?.split(" ")[1] || req.cookies?.token;
  if (token === "null" || token === "undefined") {
    token = null;
  }
  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user || !req.user.isActive) return res.status(401).json({ success: false, message: "Unauthorized" });
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: "Unauthorized" });
  }
}, "authenticate");
async function serverHasPermission(user, permission) {
  if (!user) return false;
  const roleLower = (user.role || "").toLowerCase().trim();
  if (roleLower === "super admin" || roleLower === "superadmin" || roleLower === "admin") return true;
  if (permission.startsWith("VIEW_")) return true;
  const rolePerm = await RolePermission.findOne({ role: { $regex: new RegExp(`^${user.role}$`, "i") } });
  if (rolePerm?.permissions.includes(permission)) return true;
  if (user.permissions?.includes(permission)) return true;
  return false;
}
__name(serverHasPermission, "serverHasPermission");
export {
  authenticate,
  serverHasPermission
};
