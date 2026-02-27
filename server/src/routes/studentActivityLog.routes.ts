import express from 'express';
import StudentActivityLog from '../models/StudentActivityLog';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Получить логи активности студента
router.get('/student/:studentId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { studentId } = req.params;
    const { limit = 50, skip = 0, unreadOnly = false } = req.query;
    
    const filter: any = { studentId };
    if (unreadOnly === 'true') {
      filter.isRead = false;
    }
    
    const logs = await StudentActivityLog.find(filter)
      .populate('performedBy', 'fullName username')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string))
      .skip(parseInt(skip as string))
      .lean();
    
    const total = await StudentActivityLog.countDocuments(filter);
    const unreadCount = await StudentActivityLog.countDocuments({ studentId, isRead: false });
    
    res.json({
      logs,
      total,
      unreadCount
    });
  } catch (error: any) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Отметить уведомления как прочитанные
router.post('/student/:studentId/mark-read', authenticate, async (req: AuthRequest, res) => {
  try {
    const { studentId } = req.params;
    const { logIds } = req.body;
    
    if (logIds && Array.isArray(logIds)) {
      // Отметить конкретные уведомления
      await StudentActivityLog.updateMany(
        { _id: { $in: logIds }, studentId },
        { isRead: true }
      );
    } else {
      // Отметить все уведомления студента
      await StudentActivityLog.updateMany(
        { studentId },
        { isRead: true }
      );
    }
    
    res.json({ message: 'Belgilandi' });
  } catch (error: any) {
    console.error('Error marking logs as read:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Создать лог активности (вспомогательная функция для других роутов)
export async function createActivityLog(data: {
  studentId: string;
  activityType: string;
  title: string;
  description: string;
  metadata?: any;
  performedBy?: string;
}) {
  try {
    const log = new StudentActivityLog(data);
    await log.save();
    return log;
  } catch (error) {
    console.error('Error creating activity log:', error);
  }
}

export default router;
