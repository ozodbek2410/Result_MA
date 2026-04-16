import express, { Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import User, { UserRole } from '../models/User';
import TeacherGroupAssignment, { AssignmentSource } from '../models/TeacherGroupAssignment';
import Group from '../models/Group';
import Subject from '../models/Subject';
import { logger } from '../config/logger';

const router = express.Router();

const ADMIN_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.FIL_ADMIN];

function badRequest(res: Response, message: string) {
  return res.status(400).json({ message });
}

/**
 * GET /api/admin/teacher-assignments?branchId=&teacherId=&groupId=
 * Full listing with rich population for the admin UI.
 */
router.get(
  '/',
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: AuthRequest, res) => {
    try {
      const filter: Record<string, unknown> = {};
      const { teacherId, groupId, subjectId, activeOnly } = req.query;

      if (teacherId && mongoose.isValidObjectId(teacherId)) {
        filter.teacherId = new Types.ObjectId(teacherId as string);
      }
      if (groupId && mongoose.isValidObjectId(groupId)) {
        filter.groupId = new Types.ObjectId(groupId as string);
      }
      if (subjectId && mongoose.isValidObjectId(subjectId)) {
        filter.subjectId = new Types.ObjectId(subjectId as string);
      }
      if (activeOnly === 'true') filter.isActive = true;

      // FIL_ADMIN is scoped to their branch — filter via teacher.branchId
      if (req.user?.role === UserRole.FIL_ADMIN && req.user.branchId) {
        const teachers = await User.find({
          role: UserRole.TEACHER,
          branchId: new Types.ObjectId(req.user.branchId),
        }).select('_id').lean();
        const ids = teachers.map(t => t._id);
        filter.teacherId = filter.teacherId
          ? { $and: [{ $eq: filter.teacherId }, { $in: ids }] }
          : { $in: ids };
      }

      const rows = await TeacherGroupAssignment.find(filter)
        .populate('teacherId', 'fullName username crmId')
        .populate('groupId', 'name classNumber letter crmId')
        .populate('subjectId', 'nameUzb crmId')
        .sort({ createdAt: -1 })
        .lean();

      res.json(rows);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ message: 'Server xatosi', error: msg });
    }
  }
);

/**
 * POST /api/admin/teacher-assignments
 * body: { teacherId, groupId, subjectId }
 * Creates or reactivates an assignment with source=MANUAL and isManualOverride=true.
 * Once overridden, CRM sync will never touch this row until an admin flips the flag off.
 */
router.post(
  '/',
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: AuthRequest, res) => {
    try {
      const { teacherId, groupId, subjectId } = req.body as Record<string, string>;
      if (!teacherId || !groupId || !subjectId) {
        return badRequest(res, 'teacherId, groupId va subjectId majburiy');
      }
      if (
        !mongoose.isValidObjectId(teacherId) ||
        !mongoose.isValidObjectId(groupId) ||
        !mongoose.isValidObjectId(subjectId)
      ) {
        return badRequest(res, 'ObjectId formati noto\'g\'ri');
      }

      const [teacher, group, subject] = await Promise.all([
        User.findById(teacherId).select('_id role branchId').lean(),
        Group.findById(groupId).select('_id').lean(),
        Subject.findById(subjectId).select('_id').lean(),
      ]);
      if (!teacher || teacher.role !== UserRole.TEACHER)
        return badRequest(res, 'O\'qituvchi topilmadi yoki TEACHER emas');
      if (!group) return badRequest(res, 'Guruh topilmadi');
      if (!subject) return badRequest(res, 'Fan topilmadi');

      // FIL_ADMIN: must be same branch
      if (req.user?.role === UserRole.FIL_ADMIN && req.user.branchId) {
        if (teacher.branchId?.toString() !== req.user.branchId) {
          return res.status(403).json({ message: 'Bu o\'qituvchi sizning filialga tegishli emas' });
        }
      }

      const existing = await TeacherGroupAssignment.findOne({
        teacherId: new Types.ObjectId(teacherId),
        groupId: new Types.ObjectId(groupId),
        subjectId: new Types.ObjectId(subjectId),
      });

      if (existing) {
        await TeacherGroupAssignment.updateOne(
          { _id: existing._id },
          {
            $set: {
              isActive: true,
              isManualOverride: true,
              source: AssignmentSource.MANUAL,
              createdBy: new Types.ObjectId(req.user!.id),
            },
            $unset: { deactivatedAt: '', deactivatedBy: '', deactivatedReason: '' },
          }
        );
        logger.info(`Manual override assignment reactivated: ${existing._id}`, 'ADMIN');
        return res.json({ ...existing, isActive: true, isManualOverride: true });
      }

      const created = await TeacherGroupAssignment.create({
        teacherId: new Types.ObjectId(teacherId),
        groupId: new Types.ObjectId(groupId),
        subjectId: new Types.ObjectId(subjectId),
        source: AssignmentSource.MANUAL,
        isManualOverride: true,
        isActive: true,
        createdBy: new Types.ObjectId(req.user!.id),
      });
      logger.info(`Manual override assignment created: ${created._id}`, 'ADMIN');
      res.status(201).json(created);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ message: 'Server xatosi', error: msg });
    }
  }
);

/**
 * PATCH /api/admin/teacher-assignments/:id
 * body: { isActive?, isManualOverride?, reason? }
 */
router.patch(
  '/:id',
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) return badRequest(res, 'id noto\'g\'ri');

      const update: Record<string, unknown> = {};
      const unset: Record<string, ''> = {};

      if (typeof req.body.isManualOverride === 'boolean') {
        update.isManualOverride = req.body.isManualOverride;
      }
      if (typeof req.body.isActive === 'boolean') {
        update.isActive = req.body.isActive;
        if (!req.body.isActive) {
          update.deactivatedAt = new Date();
          update.deactivatedBy = new Types.ObjectId(req.user!.id);
          update.deactivatedReason = req.body.reason || 'Admin deactivated';
        } else {
          unset.deactivatedAt = '';
          unset.deactivatedBy = '';
          unset.deactivatedReason = '';
        }
      }

      if (Object.keys(update).length === 0 && Object.keys(unset).length === 0) {
        return badRequest(res, 'Yangilanadigan maydon yo\'q');
      }

      const mongoUpdate: Record<string, unknown> = {};
      if (Object.keys(update).length > 0) mongoUpdate.$set = update;
      if (Object.keys(unset).length > 0) mongoUpdate.$unset = unset;

      const updated = await TeacherGroupAssignment.findByIdAndUpdate(id, mongoUpdate, { new: true });
      if (!updated) return res.status(404).json({ message: 'Assignment topilmadi' });
      res.json(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ message: 'Server xatosi', error: msg });
    }
  }
);

export default router;
