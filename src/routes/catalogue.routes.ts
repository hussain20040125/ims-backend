import { Router } from 'express';
import { createCrudRoutes } from '../utils/crud.js';
import { Catalogue } from '../models/index.js';

const router = Router();

// Catalogue standard CRUD
createCrudRoutes(router, Catalogue, 'catalogue', 'sku', undefined, 'CATALOGUE');

export default router;
