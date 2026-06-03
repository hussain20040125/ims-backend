import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { MaterialPlanRevision, MaterialPlan } from '../models/index.js';
import { broadcast } from '../utils/broadcaster.js';
import { logAudit } from '../utils/audit.js';
import { getNextSequence } from '../utils/sequence.js';

const router = Router();

// GET — list revisions (admin/PM sees all, engineer sees only their own)
router.get('/', authenticate, async (req: any, res) => {
  try {
    const { status, planId } = req.query;
    const query: any = {};

    if (status) query.status = status;
    if (planId) query.planId = planId;

    const isAdmin = ['Super Admin', 'Director', 'Project Manager', 'admin'].includes(req.user.role);
    if (!isAdmin) {
      query.engineerName = req.user.name;
    }

    const revisions = await MaterialPlanRevision.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: revisions });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST — engineer creates a revision request
router.post('/', authenticate, async (req: any, res) => {
  try {
    const { planId, planItemSku, itemName, unit, currentAllocatedQty, requestedExtraQty, reason, project } = req.body;

    if (!planId || !planItemSku || !requestedExtraQty || !reason) {
      return res.status(400).json({ success: false, message: 'planId, planItemSku, requestedExtraQty and reason are required.' });
    }
    if (requestedExtraQty <= 0) {
      return res.status(400).json({ success: false, message: 'requestedExtraQty must be greater than 0.' });
    }

    // Block if a pending revision already exists for this plan + item + engineer
    const existing = await MaterialPlanRevision.findOne({
      planId, planItemSku, engineerName: req.user.name, status: 'pending'
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A pending revision request for this item already exists.' });
    }

    const seq = await getNextSequence('PLANREV');
    const id = `PLANREV-${new Date().getFullYear()}-${seq}`;

    const revision = await MaterialPlanRevision.create({
      id, planId, planItemSku, itemName, unit, project,
      currentAllocatedQty: currentAllocatedQty || 0,
      requestedExtraQty,
      reason,
      engineerName: req.user.name,
      engineerId: req.user._id?.toString(),
      status: 'pending',
    });

    broadcast({ type: 'DATA_UPDATED', path: 'plan-revisions' });
    logAudit(req.user, 'CREATE', 'PlanRevision', id, { planId, planItemSku, requestedExtraQty, reason });

    res.json({ success: true, data: revision });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// PUT /:id — admin approves or rejects
router.put('/:id', authenticate, async (req: any, res) => {
  try {
    const isAdmin = ['Super Admin', 'Director', 'Project Manager', 'admin'].includes(req.user.role);
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Only Admin / Project Manager can review revisions.' });
    }

    const { status, reviewNote } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be "approved" or "rejected".' });
    }

    const revision = await MaterialPlanRevision.findOne({ id: req.params.id });
    if (!revision) return res.status(404).json({ success: false, message: 'Revision not found.' });
    if (revision.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'This revision has already been reviewed.' });
    }

    revision.status = status;
    revision.reviewedBy = req.user.name;
    revision.reviewNote = reviewNote || '';
    revision.reviewedAt = new Date().toISOString();
    await revision.save();

    // If approved → increase the plan item's allocated qty (item.required)
    if (status === 'approved') {
      const plan = await MaterialPlan.findOne({ id: revision.planId });
      if (plan) {
        const item = (plan.items as any[]).find((i: any) => i.sku === revision.planItemSku);
        if (item) {
          item.required = (item.required || 0) + (revision.requestedExtraQty || 0);
          await plan.save();
          broadcast({ type: 'DATA_UPDATED', path: 'planning' });
        }
      }
    }

    broadcast({ type: 'DATA_UPDATED', path: 'plan-revisions' });
    logAudit(req.user, status === 'approved' ? 'APPROVE' : 'REJECT', 'PlanRevision', req.params.id, {
      planId: revision.planId, planItemSku: revision.planItemSku, reviewNote
    });

    res.json({ success: true, data: revision });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
