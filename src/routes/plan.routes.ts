import { Router } from 'express';
import { createCrudRoutes } from '../utils/crud.js';
import { MaterialPlan } from '../models/index.js';

const router = Router();

// MaterialPlan standard CRUD
createCrudRoutes(router, MaterialPlan, 'planning', 'id', 'MATERIAL_PLAN', 'PLANNING');

export default router;
