import { Router } from "express";
import { createCrudRoutes } from "../utils/crud.js";
import { Supplier } from "../models/index.js";
const router = Router();
createCrudRoutes(router, Supplier, "suppliers", "id", void 0, "SUPPLIER");
var stdin_default = router;
export {
  stdin_default as default
};
