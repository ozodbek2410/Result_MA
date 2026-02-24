import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../models/User';
import { CrmSyncService } from '../services/crmSyncService';
import { CrmApiService } from '../services/crmApiService';

const router = Router();

/**
 * POST /api/crm/sync — Manual sync trigger
 */
router.post('/sync', authenticate, authorize(UserRole.SUPER_ADMIN, UserRole.FIL_ADMIN), async (req: AuthRequest, res: Response) => {
  try {
    if (CrmSyncService.isSyncRunning()) {
      return res.status(409).json({ message: 'Sinxronizatsiya allaqachon ishlayapti' });
    }

    if (!CrmApiService.isConfigured()) {
      return res.status(400).json({ message: 'CRM API sozlanmagan' });
    }

    // Start sync in background
    const userId = req.user?.id;
    CrmSyncService.syncAll(userId, 'manual').catch(err => {
      console.error('Manual sync failed:', err.message);
    });

    res.json({ message: 'Sinxronizatsiya boshlandi', running: true });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Sync error';
    res.status(500).json({ message: errMsg });
  }
});

/**
 * GET /api/crm/sync/status — Last sync status
 */
router.get('/sync/status', authenticate, authorize(UserRole.SUPER_ADMIN, UserRole.FIL_ADMIN), async (_req: AuthRequest, res: Response) => {
  try {
    const lastSync = await CrmSyncService.getLastSync();
    const isRunning = CrmSyncService.isSyncRunning();
    const isConfigured = CrmApiService.isConfigured();

    res.json({
      isConfigured,
      isRunning,
      lastSync,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Status error';
    res.status(500).json({ message: errMsg });
  }
});

/**
 * GET /api/crm/sync/logs — Sync history
 */
router.get('/sync/logs', authenticate, authorize(UserRole.SUPER_ADMIN), async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await CrmSyncService.getSyncLogs(page, limit);
    res.json(result);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Logs error';
    res.status(500).json({ message: errMsg });
  }
});

export default router;
