import express from 'express';
import bcrypt from 'bcryptjs';
import User, { UserRole } from '../models/User';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { invalidateCache } from '../middleware/cache';
import { cacheService, CacheTTL, CacheInvalidation } from '../utils/cache';

const CRM_MSG = 'Bu ma\'lumot CRM orqali boshqariladi';

const router = express.Router();

// Get all teachers
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const filter: Record<string, unknown> = { role: UserRole.TEACHER, isActive: true };

    if (req.user?.role !== UserRole.SUPER_ADMIN) {
      filter.branchId = req.user?.branchId;
    }

    const cacheKey = `teachers:${req.user?.branchId || 'all'}`;
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const teachers = await User.find(filter)
      .select('-password')
      .populate('branchId')
      .populate('teacherSubjects')
      .sort({ createdAt: -1 })
      .lean();

    cacheService.set(cacheKey, teachers, CacheTTL.LIST);
    res.json(teachers);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message: 'Server xatosi', error: msg });
  }
});

// Create local teacher (admin only)
router.post('/', authenticate, authorize(UserRole.SUPER_ADMIN, UserRole.FIL_ADMIN), async (req: AuthRequest, res) => {
  try {
    const { username, password, fullName, phone, branchId, teacherSubjects } = req.body;

    if (!username || !password || !fullName) {
      return res.status(400).json({ message: 'Login, parol va F.I.Sh majburiy' });
    }

    if (password.length < 4) {
      return res.status(400).json({ message: 'Parol kamida 4 belgidan iborat bo\'lishi kerak' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Bu login band' });
    }

    // FIL_ADMIN can only create for own branch
    const effectiveBranchId = req.user?.role === UserRole.FIL_ADMIN
      ? req.user.branchId
      : branchId;

    if (!effectiveBranchId) {
      return res.status(400).json({ message: 'Filial majburiy' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const teacher = new User({
      username,
      password: hashedPassword,
      fullName,
      phone,
      role: UserRole.TEACHER,
      branchId: effectiveBranchId,
      teacherSubjects: teacherSubjects || [],
      isActive: true,
    });

    await teacher.save();

    const populatedTeacher = await User.findById(teacher._id)
      .select('-password')
      .populate('branchId')
      .populate('teacherSubjects');

    CacheInvalidation.onTeacherChange();
    await invalidateCache('/api/teachers');

    res.status(201).json(populatedTeacher);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message: 'Server xatosi', error: msg });
  }
});

// Assign credentials to CRM teacher
router.patch('/:id/credentials', authenticate, authorize(UserRole.SUPER_ADMIN, UserRole.FIL_ADMIN), async (req: AuthRequest, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Login va parol majburiy' });
    }

    if (password.length < 4) {
      return res.status(400).json({ message: 'Parol kamida 4 belgidan iborat bo\'lishi kerak' });
    }

    const teacher = await User.findOne({ _id: req.params.id, role: UserRole.TEACHER });
    if (!teacher) {
      return res.status(404).json({ message: 'O\'qituvchi topilmadi' });
    }

    // FIL_ADMIN can only modify teachers in own branch
    if (req.user?.role === UserRole.FIL_ADMIN && teacher.branchId?.toString() !== req.user.branchId) {
      return res.status(403).json({ message: 'Faqat o\'z filialingiz o\'qituvchilarini o\'zgartira olasiz' });
    }

    // Check username uniqueness
    if (username !== teacher.username) {
      const existing = await User.findOne({ username, _id: { $ne: teacher._id } });
      if (existing) {
        return res.status(400).json({ message: 'Bu login band' });
      }
    }

    teacher.username = username;
    teacher.password = await bcrypt.hash(password, 10);
    await teacher.save();

    const updated = await User.findById(teacher._id)
      .select('-password')
      .populate('branchId')
      .populate('teacherSubjects');

    CacheInvalidation.onTeacherChange();
    await invalidateCache('/api/teachers');

    res.json(updated);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message: 'Server xatosi', error: msg });
  }
});

// CRM-managed: full update disabled
router.put('/:id', authenticate, async (_req: AuthRequest, res) => {
  return res.status(403).json({ message: CRM_MSG });
});

// CRM-managed: delete disabled
router.delete('/:id', authenticate, async (_req: AuthRequest, res) => {
  return res.status(403).json({ message: CRM_MSG });
});

export default router;
