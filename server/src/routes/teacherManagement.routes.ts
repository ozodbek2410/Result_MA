import express from 'express';
import bcrypt from 'bcryptjs';
import User, { UserRole } from '../models/User';
import Student from '../models/Student';
import Group from '../models/Group';
import StudentGroup from '../models/StudentGroup';
import BlockTest from '../models/BlockTest';
import StudentVariant from '../models/StudentVariant';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createActivityLog } from './studentActivityLog.routes';

const router = express.Router();

/**
 * O'qituvchi uchun guruh va o'quvchilarni boshqarish
 */

// ============= GURUHLAR =============

// O'qituvchining guruhlarini olish
router.get('/my-groups', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Faqat o\'qituvchilar uchun' });
    }

    const groups = await Group.find({ teacherId: req.user.id, isActive: { $ne: false } })
      .populate('branchId', 'name location')
      .populate('subjectId', 'nameUzb')
      .sort({ name: 1 })
      .lean();

    // Har bir guruh uchun o'quvchilar sonini hisoblash
    const groupsWithCount = await Promise.all(
      groups.map(async (group) => {
        const studentsCount = await StudentGroup.countDocuments({ groupId: group._id });
        return {
          ...group,
          studentsCount
        };
      })
    );

    res.json(groupsWithCount);
  } catch (error: any) {
    console.error('Error fetching teacher groups:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Guruh yaratish (o'qituvchi o'zi uchun)
router.post('/groups', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Faqat o\'qituvchilar uchun' });
    }

    const { name, classNumber, subjectId, letter, capacity } = req.body;

    if (!name || !classNumber || !subjectId || !letter) {
      return res.status(400).json({ message: 'Barcha majburiy maydonlarni to\'ldiring' });
    }

    const group = new Group({
      name,
      classNumber,
      subjectId,
      letter,
      capacity: capacity || 20,
      branchId: req.user.branchId,
      teacherId: req.user.id // O'qituvchi o'zini tayinlaydi
    });

    await group.save();

    const populatedGroup = await Group.findById(group._id)
      .populate('branchId', 'name location')
      .populate('subjectId', 'nameUzb')
      .populate('teacherId', 'fullName username');

    res.status(201).json(populatedGroup);
  } catch (error: any) {
    console.error('Error creating group:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Guruhni yangilash (faqat o'z guruhi)
router.put('/groups/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Faqat o\'qituvchilar uchun' });
    }

    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }

    // Faqat o'z guruhini tahrirlash mumkin
    if (group.teacherId?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Bu guruhni tahrirlash huquqingiz yo\'q' });
    }

    Object.assign(group, req.body);
    await group.save();

    const populatedGroup = await Group.findById(group._id)
      .populate('branchId', 'name location')
      .populate('subjectId', 'nameUzb')
      .populate('teacherId', 'fullName username');

    res.json(populatedGroup);
  } catch (error: any) {
    console.error('Error updating group:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Guruhni o'chirish (faqat o'z guruhi)
router.delete('/groups/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Faqat o\'qituvchilar uchun' });
    }

    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }

    // Faqat o'z guruhini o'chirish mumkin
    if (group.teacherId?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Bu guruhni o\'chirish huquqingiz yo\'q' });
    }

    // Guruhni o'chirish
    await Group.findByIdAndDelete(req.params.id);

    // Guruhga tegishli StudentGroup yozuvlarini ham o'chirish
    await StudentGroup.deleteMany({ groupId: req.params.id });

    res.json({ message: 'Guruh o\'chirildi' });
  } catch (error: any) {
    console.error('Error deleting group:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// ============= O'QUVCHILAR =============

// O'quvchi yaratish (User jadvalida STUDENT roli bilan)
router.post('/students', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== UserRole.TEACHER && req.user?.role !== UserRole.SUPER_ADMIN) {
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }

    const { username, password: plainPassword, fullName, phone, parentPhone } = req.body;

    if (!username || !plainPassword || !fullName) {
      return res.status(400).json({ message: 'Login, parol va F.I.Sh majburiy' });
    }

    // Username mavjudligini tekshirish
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Bu login band' });
    }

    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const student = new User({
      username,
      password: hashedPassword,
      fullName,
      phone,
      parentPhone,
      role: UserRole.STUDENT,
      branchId: req.user.branchId,
      isActive: true
    });

    await student.save();

    const studentData = student.toObject();
    const { password, ...studentWithoutPassword } = studentData;

    res.status(201).json(studentWithoutPassword);
  } catch (error: any) {
    console.error('Error creating student:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// O'quvchini guruhga qo'shish
router.post('/groups/:groupId/students/:studentId', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Faqat o\'qituvchilar uchun' });
    }

    const { groupId, studentId } = req.params;

    // Guruhni tekshirish
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }

    // Faqat o'z guruhiga qo'shish mumkin
    if (group.teacherId?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Bu guruhga o\'quvchi qo\'shish huquqingiz yo\'q' });
    }

    // O'quvchini tekshirish (Student modelida)
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'O\'quvchi topilmadi' });
    }

    // Allaqachon guruhda borligini tekshirish
    const existing = await StudentGroup.findOne({ studentId, groupId });
    if (existing) {
      return res.status(400).json({ message: 'O\'quvchi allaqachon guruhda' });
    }

    // Bir fandan faqat bitta guruhda bo'lish logikasi
    // Agar o'quvchi shu fandan boshqa guruhda bo'lsa, o'sha guruhdan chiqarish
    const existingInSameSubject = await StudentGroup.findOne({
      studentId,
      subjectId: group.subjectId
    }).populate('groupId');

    if (existingInSameSubject) {
      // O'sha guruhdan o'chirish
      await StudentGroup.deleteOne({ _id: existingInSameSubject._id });
      console.log(`O'quvchi ${studentId} ${group.subjectId} fanidan boshqa guruhdan chiqarildi`);
    }

    // Yangi guruhga qo'shish
    const studentGroup = new StudentGroup({
      studentId,
      groupId,
      subjectId: group.subjectId
    });

    await studentGroup.save();

    // Создаем лог активности
    const groupWithSubject = await Group.findById(groupId).populate('subjectId', 'nameUzb');
    await createActivityLog({
      studentId,
      activityType: 'group_added',
      title: 'Guruhga qo\'shildi',
      description: `${groupWithSubject?.name} guruhiga qo'shildi`,
      metadata: {
        groupId: groupId,
        groupName: groupWithSubject?.name,
        subjectId: group.subjectId,
        subjectName: (groupWithSubject?.subjectId as any)?.nameUzb
      },
      performedBy: req.user?.id
    });

    res.status(201).json({ 
      message: existingInSameSubject 
        ? 'O\'quvchi boshqa guruhdan ko\'chirildi va bu guruhga qo\'shildi' 
        : 'O\'quvchi guruhga qo\'shildi' 
    });
  } catch (error: any) {
    console.error('Error adding student to group:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// O'quvchini guruhdan o'chirish
router.delete('/groups/:groupId/students/:studentId', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Faqat o\'qituvchilar uchun' });
    }

    const { groupId, studentId } = req.params;

    // Guruhni tekshirish
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }

    // Faqat o'z guruhidan o'chirish mumkin
    if (group.teacherId?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Bu guruhdan o\'quvchi o\'chirish huquqingiz yo\'q' });
    }

    await StudentGroup.deleteOne({ studentId, groupId });

    // O'quvchining eskirgan blok test variantlarini o'chirish
    try {
      const blockTests = await BlockTest.find({ groupId }).select('_id').lean();
      if (blockTests.length > 0) {
        const btIds = blockTests.map(bt => bt._id);
        const del = await StudentVariant.deleteMany({ testId: { $in: btIds }, studentId });
        if (del.deletedCount > 0) {
          console.log(`🗑️ Deleted ${del.deletedCount} variants for student ${studentId} (removed from group)`);
        }
      }
    } catch (e) {
      console.error('Variant cleanup error:', e);
    }

    // Создаем лог активности
    const groupWithSubject = await Group.findById(groupId).populate('subjectId', 'nameUzb');
    await createActivityLog({
      studentId,
      activityType: 'group_removed',
      title: 'Guruhdan chiqarildi',
      description: `${groupWithSubject?.name} guruhidan chiqarildi`,
      metadata: {
        groupId: groupId,
        groupName: groupWithSubject?.name,
        subjectId: group.subjectId,
        subjectName: (groupWithSubject?.subjectId as any)?.nameUzb
      },
      performedBy: req.user?.id
    });

    res.json({ message: 'O\'quvchi guruhdan o\'chirildi' });
  } catch (error: any) {
    console.error('Error removing student from group:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

export default router;
