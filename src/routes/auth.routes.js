import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
const router = Router();
router.post("/login", AuthController.login);
router.post("/logout", authenticate, AuthController.logout);
router.get("/me", authenticate, AuthController.me);
router.post("/switch-user", authenticate, AuthController.switchUser);
router.post("/change-password", authenticate, AuthController.changePassword);
var stdin_default = router;
export {
  stdin_default as default
};
