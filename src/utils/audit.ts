import { AuditLog } from '../models/index.js';

export type AuditAction = 'LOGIN' | 'LOGOUT' | 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'CANCEL';

export const logAudit = (
  user: { _id: any; name?: string; email?: string } | null,
  action: AuditAction,
  resource: string,
  resourceId?: string,
  details?: Record<string, any>
): void => {
  if (!user) return;
  AuditLog.create({
    userId: user._id,
    userName: user.name || 'Unknown',
    userEmail: user.email || '',
    action,
    resource,
    resourceId,
    details,
  }).catch((err) => console.error('[Audit] Failed to write log:', err));
};
