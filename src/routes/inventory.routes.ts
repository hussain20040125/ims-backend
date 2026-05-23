import { Router } from 'express';
import { createCrudRoutes } from '../utils/crud.js';
import { Inventory } from '../models/index.js';

const router = Router();

// Inventory standard CRUD
createCrudRoutes(router, Inventory, 'inventory', 'sku', undefined, 'INVENTORY');

export default router;
