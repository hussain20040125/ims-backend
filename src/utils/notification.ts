import { randomUUID } from 'crypto';
import { Notification, RolePermission } from '../models/index.js';
import { broadcast } from './broadcaster.js';
import { logger } from './logger.js';

export const RESOURCE_ROLES: Record<string, string[]> = {
  'pos': ["Super Admin", "Director", "AGM", "Head", "Purchase coordinator", "Accountant", "Finance Manager"],
  'material-requirements': ["Purchase coordinator", "Inventory Manager", "Super Admin", "AGM", "Project Manager", "Site Engineer"],
  'inventory': ["Inventory Manager", "Store Incharge", "Super Admin", "Head", "Store Assistant"],
  'suppliers': ["Super Admin", "Purchase coordinator", "AGM", "Head"],
  'planning': ["Project Manager", "Purchase coordinator", "Super Admin", "Director", "AGM"],
  'grn': ["Inventory Manager", "Accountant", "Super Admin", "AGM", "Finance Manager", "Purchase coordinator"],
  'quotations': ["Purchase coordinator", "Head", "Super Admin", "AGM", "Director", "Inventory Manager", "manager", "admin", "staff"],
  'inward': ["Inventory Manager", "Store Incharge", "Super Admin", "Store Assistant", "AGM", "Purchase coordinator", "manager", "Accountant", "Project Manager", "Site Engineer"],
  'outward': ["Inventory Manager", "Store Incharge", "Super Admin", "Project Manager", "Site Engineer", "AGM", "Purchase coordinator", "Accountant"],
  'inward-returns': ["Inventory Manager", "Store Incharge", "Super Admin"],
  'outward-returns': ["Inventory Manager", "Store Incharge", "Super Admin"],
  'transfer-inward': ["Inventory Manager", "Store Incharge", "Super Admin", "Project Manager"],
  'transfer-outward': ["Inventory Manager", "Store Incharge", "Super Admin", "Project Manager"],
  'writeoffs': ["Super Admin", "Director", "AGM", "Head", "Inventory Manager"],
  'stock-check-reports': ["Inventory Manager", "Super Admin", "AGM", "Head"],
  'users': ["Super Admin", "Director"],
  'audit-logs': ["Super Admin", "Director"],
};

export async function getRolesWithPermission(permission: string): Promise<string[]> {
  const roles = await RolePermission.find({ permissions: permission }).distinct('role');
  return ["Super Admin", ...roles];
}

export async function createNotification(data: {
  message: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
  path?: string;
  senderId?: any;
  targetRoles?: string[];
}) {
  try {
    const targetRoles = data.targetRoles
      ?? (data.path ? (RESOURCE_ROLES[data.path] ?? ["Super Admin", "admin"]) : ["Super Admin", "admin"]);

    const notifId = `NOTIF-${randomUUID()}`;

    const notification = await Notification.create({
      id: notifId,
      message: data.message,
      severity: data.severity ?? 'info',
      senderId: data.senderId,
      path: data.path,
      targetRoles,
      readBy: [],
    });

    broadcast({
      type: 'NOTIFICATION',
      id: notifId,
      message: data.message,
      severity: data.severity ?? 'info',
      path: data.path,
      senderId: data.senderId?.toString(),
      targetRoles,
    });

    return notification;
  } catch (err) {
    logger.error('[Notification] Failed to create:', err);
  }
}
