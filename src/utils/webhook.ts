import { Inventory } from '../models/index.js';
import { createNotification } from './notification.js';

export async function triggerN8nWebhook(event: string, payload: Record<string, any>): Promise<void> {
  const eventEnvMap: Record<string, string | undefined> = {
    NEW_PO:                process.env.N8N_WEBHOOK_NEW_PO,
    GRN:                   process.env.N8N_WEBHOOK_GRN,
    LOW_STOCK:             process.env.N8N_WEBHOOK_LOW_STOCK,
    SUPPLIER:              process.env.N8N_WEBHOOK_SUPPLIER,
    MATERIAL_REQ:          process.env.N8N_WEBHOOK_MATERIAL_REQ,
    INWARD:                process.env.N8N_WEBHOOK_INWARD,
    OUTWARD:               process.env.N8N_WEBHOOK_OUTWARD,
    STOCK_CHECK:           process.env.N8N_WEBHOOK_STOCK_CHECK,
    PO_APPROVAL:           process.env.N8N_WEBHOOK_PO_APPROVAL,
    LOGIN:                 process.env.N8N_WEBHOOK_LOGIN,
    INVENTORY_CREATE:      process.env.N8N_WEBHOOK_INVENTORY_CREATE,
    INVENTORY_UPDATE:      process.env.N8N_WEBHOOK_INVENTORY_UPDATE,
    INVENTORY_DELETE:      process.env.N8N_WEBHOOK_INVENTORY_DELETE,
    CATALOGUE_CREATE:      process.env.N8N_WEBHOOK_CATALOGUE_CREATE,
    CATALOGUE_UPDATE:      process.env.N8N_WEBHOOK_CATALOGUE_UPDATE,
    CATALOGUE_DELETE:      process.env.N8N_WEBHOOK_CATALOGUE_DELETE,
    SUPPLIER_UPDATE:       process.env.N8N_WEBHOOK_SUPPLIER_UPDATE,
    SUPPLIER_DELETE:       process.env.N8N_WEBHOOK_SUPPLIER_DELETE,
    PO_UPDATE:             process.env.N8N_WEBHOOK_PO_UPDATE,
    PO_DELETE:             process.env.N8N_WEBHOOK_PO_DELETE,
    PLANNING_CREATE:       process.env.N8N_WEBHOOK_PLANNING_CREATE,
    PLANNING_UPDATE:       process.env.N8N_WEBHOOK_PLANNING_UPDATE,
    PLANNING_DELETE:       process.env.N8N_WEBHOOK_PLANNING_DELETE,
    MR_UPDATE:             process.env.N8N_WEBHOOK_MR_UPDATE,
    MR_DELETE:             process.env.N8N_WEBHOOK_MR_DELETE,
    QUOTATION_CREATE:      process.env.N8N_WEBHOOK_QUOTATION_CREATE,
    QUOTATION_UPDATE:      process.env.N8N_WEBHOOK_QUOTATION_UPDATE,
    QUOTATION_DELETE:      process.env.N8N_WEBHOOK_QUOTATION_DELETE,
    WRITEOFF_CREATE:       process.env.N8N_WEBHOOK_WRITEOFF_CREATE,
    WRITEOFF_UPDATE:       process.env.N8N_WEBHOOK_WRITEOFF_UPDATE,
    WRITEOFF_DELETE:       process.env.N8N_WEBHOOK_WRITEOFF_DELETE,
    INWARD_UPDATE:         process.env.N8N_WEBHOOK_INWARD_UPDATE,
    INWARD_DELETE:         process.env.N8N_WEBHOOK_INWARD_DELETE,
    OUTWARD_UPDATE:        process.env.N8N_WEBHOOK_OUTWARD_UPDATE,
    OUTWARD_DELETE:        process.env.N8N_WEBHOOK_OUTWARD_DELETE,
    INWARD_RETURN:         process.env.N8N_WEBHOOK_INWARD_RETURN,
    INWARD_RETURN_UPDATE:  process.env.N8N_WEBHOOK_INWARD_RETURN_UPDATE,
    INWARD_RETURN_DELETE:  process.env.N8N_WEBHOOK_INWARD_RETURN_DELETE,
    OUTWARD_RETURN:        process.env.N8N_WEBHOOK_OUTWARD_RETURN,
    OUTWARD_RETURN_UPDATE: process.env.N8N_WEBHOOK_OUTWARD_RETURN_UPDATE,
    OUTWARD_RETURN_DELETE: process.env.N8N_WEBHOOK_OUTWARD_RETURN_DELETE,
    GRN_UPDATE:            process.env.N8N_WEBHOOK_GRN_UPDATE,
    GRN_DELETE:            process.env.N8N_WEBHOOK_GRN_DELETE,
    STOCK_CHECK_APPROVE:   process.env.N8N_WEBHOOK_STOCK_CHECK_APPROVE,
    STOCK_CHECK_REJECT:    process.env.N8N_WEBHOOK_STOCK_CHECK_REJECT,
    USER_CREATE:           process.env.N8N_WEBHOOK_USER_CREATE,
    USER_UPDATE:           process.env.N8N_WEBHOOK_USER_UPDATE,
    USER_DELETE:           process.env.N8N_WEBHOOK_USER_DELETE,
    ROLE_PERMISSION:       process.env.N8N_WEBHOOK_ROLE_PERMISSION,
    SETTINGS:              process.env.N8N_WEBHOOK_SETTINGS,
  };

  const webhookUrl = eventEnvMap[event] || process.env.N8N_WEBHOOK_GENERIC;
  if (!webhookUrl) return;

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.N8N_WEBHOOK_SECRET) {
      headers['X-Webhook-Secret'] = process.env.N8N_WEBHOOK_SECRET;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), ...payload }),
      signal: controller.signal
    });
    clearTimeout(timeout);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error(`[n8n] Webhook for event "${event}" timed out after 5s`);
    } else {
      console.error(`[n8n] Failed to fire webhook for event "${event}":`, err);
    }
  }
}

export async function checkAndFireLowStockWebhook(skus: string[]): Promise<void> {
  try {
    const lowItems = await Inventory.aggregate([
      { $match: { sku: { $in: skus } } },
      { $lookup: { from: 'catalogues', localField: 'sku', foreignField: 'sku', as: 'catalogue' } },
      { $unwind: { path: '$catalogue', preserveNullAndEmptyArrays: false } },
      { $match: { $expr: { $lte: ['$liveStock', '$catalogue.minStock'] } } },
      { $project: { sku: 1, itemName: 1, liveStock: 1, minStock: '$catalogue.minStock', unit: 1 } },
    ]);

    for (const item of lowItems) {
      await createNotification({
        message: `Low Stock Alert: ${item.itemName} (${item.sku}) is at ${item.liveStock} ${item.unit} (Min: ${item.minStock})`,
        severity: 'warning',
        path: 'inventory'
      });

      await triggerN8nWebhook('LOW_STOCK', {
        sku: item.sku,
        itemName: item.itemName,
        liveStock: item.liveStock,
        minStock: item.minStock,
        unit: item.unit,
      });
    }
  } catch (err) {
    console.error('[n8n] Low stock check failed:', err);
  }
}
