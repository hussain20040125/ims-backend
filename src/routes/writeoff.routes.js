import { Router } from "express";
import { createCrudRoutes } from "../utils/crud.js";
import { WriteOff } from "../models/index.js";
const router = Router();
createCrudRoutes(router, WriteOff, "writeoffs", "id", void 0, "WRITEOFF");
var stdin_default = router;
export {
  stdin_default as default
};
