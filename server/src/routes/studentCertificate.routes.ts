import express from 'express';
import mongoose from 'mongoose';
import StudentSubjectCertificate from '../models/StudentSubjectCertificate';
import StudentGroup from '../models/StudentGroup';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

/**
 * GET /api/student-certificates/group/:groupId
 * Guruh o'quvchilarining barcha fanlar bo'yicha sertifikat foizlarini qaytaradi.
 * Response: [{ studentId, subjectId, percentage, note }]
 */
router.get('/group/:groupId', authenticate, async (req: AuthRequest, res) => {
  try {
    // Guruh o'quvchilarini topish
    const studentGroups = await StudentGroup.find({ groupId: req.params.groupId })
      .select('studentId')
      .lean();

    const studentIds = [...new Set(studentGroups.map(sg => sg.studentId.toString()))];

    if (studentIds.length === 0) {
      return res.json([]);
    }

    const certs = await StudentSubjectCertificate.find({
      studentId: { $in: studentIds },
    })
      .select('studentId subjectId percentage note')
      .lean();

    res.json(certs);
  } catch (err: unknown) {
    res.status(500).json({ message: 'Server xatosi', error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * GET /api/student-certificates/student/:studentId
 * Bitta o'quvchining barcha sertifikatlarini qaytaradi.
 */
router.get('/student/:studentId', authenticate, async (req: AuthRequest, res) => {
  try {
    const certs = await StudentSubjectCertificate.find({ studentId: req.params.studentId })
      .populate('subjectId', 'nameUzb nameRu')
      .lean();
    res.json(certs);
  } catch (err: unknown) {
    res.status(500).json({ message: 'Server xatosi', error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * PUT /api/student-certificates
 * Bulk upsert: bir yoki bir nechta o'quvchi+fan sertifikat foizini saqlash.
 * Body: { branchId, items: [{ studentId, subjectId, percentage, note }] }
 * percentage = null yoki 0 bo'lsa — o'chirish
 */
router.put('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const branchId = req.user?.branchId;
    const { items } = req.body as {
      items: { studentId: string; subjectId: string; percentage: number | null; note?: string }[];
    };

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items array kerak' });
    }

    const toDelete: { studentId: string; subjectId: string }[] = [];
    const toUpsert: { studentId: string; subjectId: string; percentage: number; note?: string }[] = [];

    for (const item of items) {
      if (!item.studentId || !item.subjectId) continue;
      if (item.percentage === null || item.percentage === 0 || item.percentage === undefined) {
        toDelete.push({ studentId: item.studentId, subjectId: item.subjectId });
      } else {
        toUpsert.push({
          studentId: item.studentId,
          subjectId: item.subjectId,
          percentage: item.percentage,
          note: item.note,
        });
      }
    }

    // O'chirish
    for (const { studentId, subjectId } of toDelete) {
      await StudentSubjectCertificate.deleteOne({ studentId, subjectId });
    }

    // Saqlash (upsert)
    if (toUpsert.length > 0) {
      const ops = toUpsert.map(({ studentId, subjectId, percentage, note }) => ({
        updateOne: {
          filter: { studentId: new mongoose.Types.ObjectId(studentId), subjectId: new mongoose.Types.ObjectId(subjectId) },
          update: {
            $set: {
              percentage,
              branchId: new mongoose.Types.ObjectId(branchId as string),
              ...(note !== undefined ? { note } : {}),
              createdAt: new Date(),
            },
          },
          upsert: true,
        },
      }));
      await StudentSubjectCertificate.bulkWrite(ops);
    }

    res.json({ message: 'Saqlandi' });
  } catch (err: unknown) {
    res.status(500).json({ message: 'Server xatosi', error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
