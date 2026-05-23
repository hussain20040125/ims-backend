import { Router } from 'express';
import { createCrudRoutes } from '../utils/crud.js';
import { Supplier } from '../models/index.js';

const router = Router();

// Supplier standard CRUD (registered both under suppliers and vendors alias if needed, handled in server.ts router mounting)
createCrudRoutes(router, Supplier, 'suppliers', 'id', undefined, 'SUPPLIER');

export default router;
