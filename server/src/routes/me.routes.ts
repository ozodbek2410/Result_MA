import express, { Response } from 'express';
import { Types } from 'mongoose';
import { authenticate, AuthRequest } from '../middleware/auth';
import { UserRole } from '../models/User';
import TeacherGroupAssignment from '../models/TeacherGroupAssignment';
import Group from '../models/Group';
import StudentGroup from '../models/StudentGroup';
import Test from '../models/Test';
import { isScopingReadEnabled } from '../config/featureFlags';

const router = express.Router();

/**
 * Resolve the set of groups the current teacher can see.
 *
 * When TEACHER_SCOPING_READ is on, we use TeacherGroupAssignment (per-subject).
 * Otherwise we fall back to the legacy Group.teacherId so existing teachers
 * keep seeing their data before the flag flips.
 */
async function resolveTeacherGroups(teacherId: string): Promise<{
  items: Array<{
    group: Record<string, unknown>;
    subjects: Array<{ _id: string; nameUzb?: string }>;
  }>;
  groupIds: Types.ObjectId[];
}> {
  const teacherOid = new Types.ObjectId(teacherId);
  const byGroup = new Map<
    string,
    { group: Record<string, unknown>; subjects: Map<string, { _id: string; nameUzb?: string }> }
  >();

  if (isScopingReadEnabled(teacherId)) {
    const assignments = await TeacherGroupAssignment.find({
      teacherId: teacherOid,
      isActive: true,
    })
      .populate('groupId', 'name classNumber letter branchId isActive')
      .populate('subjectId', 'nameUzb')
      .lean();

    for (const a of assignments) {
      const g = a.groupId as unknown as {
        _id: Types.ObjectId;
        name: string;
        classNumber: number;
        letter: string;
        isActive: boolean;
      };
      if (!g || g.isActive === false) continue;
      const gid = g._id.toString();
      if (!byGroup.has(gid)) byGroup.set(gid, { group: g, subjects: new Map() });
      const subj = a.subjectId as unknown as { _id: Types.ObjectId; nameUzb?: string };
      if (subj?._id) {
        byGroup.get(gid)!.subjects.set(subj._id.toString(), {
          _id: subj._id.toString(),
          nameUzb: subj.nameUzb,
        });
      }
    }
  }

  // Legacy path (always consulted as a safety net — never fewer groups than before)
  const legacy = await Group.find({ teacherId: teacherOid, isActive: { $ne: false } })
    .populate('subjectId', 'nameUzb')
    .lean();
  for (const g of legacy) {
    const gid = (g._id as Types.ObjectId).toString();
    if (!byGroup.has(gid)) byGroup.set(gid, { group: g, subjects: new Map() });
    const subj = g.subjectId as unknown as { _id: Types.ObjectId; nameUzb?: string } | undefined;
    if (subj?._id) {
      byGroup.get(gid)!.subjects.set(subj._id.toString(), {
        _id: subj._id.toString(),
        nameUzb: subj.nameUzb,
      });
    }
  }

  const items = Array.from(byGroup.values()).map(entry => ({
    group: entry.group,
    subjects: Array.from(entry.subjects.values()),
  }));
  const groupIds = Array.from(byGroup.keys()).map(id => new Types.ObjectId(id));
  return { items, groupIds };
}

function ensureTeacher(req: AuthRequest, res: Response): boolean {
  if (!req.user) {
    res.status(401).json({ message: 'Autentifikatsiya talab qilinadi' });
    return false;
  }
  if (req.user.role !== UserRole.TEACHER) {
    res.status(403).json({ message: 'Faqat o\'qituvchilar uchun' });
    return false;
  }
  return true;
}

router.get('/groups', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!ensureTeacher(req, res)) return;
    const { items } = await resolveTeacherGroups(req.user!.id);

    // Attach unique student counts
    const groupIds = items.map(i => (i.group as { _id: Types.ObjectId })._id);
    const counts = await StudentGroup.aggregate([
      { $match: { groupId: { $in: groupIds } } },
      { $group: { _id: { g: '$groupId', s: '$studentId' } } },
      { $group: { _id: '$_id.g', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c: { _id: Types.ObjectId; count: number }) => [c._id.toString(), c.count]));

    const payload = items.map(item => {
      const g = item.group as { _id: Types.ObjectId } & Record<string, unknown>;
      return {
        ...g,
        subjects: item.subjects,
        studentsCount: countMap.get(g._id.toString()) || 0,
      };
    });

    res.json(payload);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: 'Server xatosi', error: msg });
  }
});

router.get('/students', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!ensureTeacher(req, res)) return;
    const { groupIds } = await resolveTeacherGroups(req.user!.id);

    const rows = await StudentGroup.find({ groupId: { $in: groupIds } })
      .populate('studentId', 'fullName classNumber phone isActive')
      .populate('groupId', 'name classNumber letter')
      .lean();

    res.json(rows);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: 'Server xatosi', error: msg });
  }
});

router.get('/tests', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!ensureTeacher(req, res)) return;
    const teacherOid = new Types.ObjectId(req.user!.id);

    const tests = await Test.find({ createdBy: teacherOid })
      .select('_id title subjectId groupId createdAt questionsCount')
      .populate('subjectId', 'nameUzb')
      .populate('groupId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.json(tests);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: 'Server xatosi', error: msg });
  }
});

export default router;
