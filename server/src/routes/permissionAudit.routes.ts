import express from 'express';
import mongoose from 'mongoose';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../models/User';
import PermissionAuditLog from '../models/PermissionAuditLog';

const router = express.Router();

/**
 * GET /api/admin/permission-audit?outcome=denied&userId=&limit=100
 */
router.get(
  '/',
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.FIL_ADMIN),
  async (req: AuthRequest, res) => {
    try {
      const { outcome, userId, action } = req.query;
      const limit = Math.min(parseInt(String(req.query.limit || '100'), 10) || 100, 500);

      const filter: Record<string, unknown> = {};
      if (outcome === 'allowed' || outcome === 'denied') filter.outcome = outcome;
      if (typeof userId === 'string' && mongoose.isValidObjectId(userId)) {
        filter.userId = new mongoose.Types.ObjectId(userId);
      }
      if (typeof action === 'string' && action) filter.action = action;

      const rows = await PermissionAuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

      // Aggregate: top denied actions in last 24h
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const topDenied = await PermissionAuditLog.aggregate([
        { $match: { outcome: 'denied', createdAt: { $gte: since } } },
        { $group: { _id: { userId: '$userId', action: '$action' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]);

      res.json({ rows, topDenied, since });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ message: 'Server xatosi', error: msg });
    }
  }
);

export default router;
