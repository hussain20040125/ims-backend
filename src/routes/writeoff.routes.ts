import { Router } from 'express';
import { createCrudRoutes } from '../utils/crud.js';
import { WriteOff } from '../models/index.js';

const router = Router();

// WriteOff standard CRUD
createCrudRoutes(router, WriteOff, 'writeoffs', 'id', undefined, 'WRITEOFF');

export default router;
