import { Router } from 'express';
import { createCrudRoutes } from '../utils/crud.js';
import { Inventory, Catalogue } from '../models/index.js';

const router = Router();

// Returns the next available SKU for a given prefix (e.g. "ELE/COP/")
// Must be registered BEFORE crud routes so it isn't swallowed by /:id
router.get('/next-sku', async (req, res) => {
  try {
    const { prefix } = req.query as { prefix?: string };
    if (!prefix) return res.status(400).json({ success: false, message: 'prefix is required' });

    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escaped}`, 'i');

    const [invDocs, catDocs] = await Promise.all([
      Inventory.find({ sku: regex }, { sku: 1, _id: 0 }).lean(),
      Catalogue.find({ sku: regex }, { sku: 1, _id: 0 }).lean(),
    ]);

    let maxNum = 0;
    for (const doc of [...invDocs, ...catDocs]) {
      const parts = (doc as any).sku.split('/');
      const n = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(n)) maxNum = Math.max(maxNum, n);
    }

    const nextSku = `${prefix.toUpperCase()}${String(maxNum + 1).padStart(4, '0')}`;
    res.json({ success: true, data: nextSku });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Inventory standard CRUD
createCrudRoutes(router, Inventory, 'inventory', 'sku', undefined, 'INVENTORY');

export default router;
