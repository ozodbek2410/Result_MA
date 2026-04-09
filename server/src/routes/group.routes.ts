import express from 'express';
import Group from '../models/Group';
import StudentGroup from '../models/StudentGroup';
import GroupSubjectConfig from '../models/GroupSubjectConfig';
import BlockTest from '../models/BlockTest';
import StudentVariant from '../models/StudentVariant';
import { authenticate, AuthRequest } from '../middleware/auth';
import { UserRole } from '../models/User';
import { invalidateCache } from '../middleware/cache';

const CRM_MSG = 'Bu ma\'lumot CRM orqali boshqariladi';

const router = express.Router();

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const filter: any = {};
    
    // Фильтрация по роли
    if (req.user?.role !== UserRole.SUPER_ADMIN) {
      filter.branchId = req.user?.branchId;
    }
    
    // Оптимизированный запрос БЕЗ lean() для правильного populate
    const groups = await Group.find(filter)
      .populate('subjectId', 'nameUzb nameRu')
      .populate('teacherId', 'username fullName') // teacherId теперь указывает на User
      .populate('branchId', 'name')
      .select('name classNumber letter teacherId branchId subjectId capacity createdAt')
      .exec();
    
    // Дополнительная фильтрация для учителя
    const filteredGroups = groups;
    
    // Получаем количество учеников одним запросом
    const groupIds = filteredGroups.map(g => g._id);
    const studentCounts = await StudentGroup.aggregate([
      { $match: { groupId: { $in: groupIds } } },
      { $group: { _id: { g: '$groupId', s: '$studentId' } } },
      { $group: { _id: '$_id.g', count: { $sum: 1 } } }
    ]);
    
    const countMap = new Map(studentCounts.map(sc => [sc._id.toString(), sc.count]));
    
    const groupsWithCount = filteredGroups.map(group => ({
      ...group.toObject(), // Преобразуем Mongoose документ в plain object
      studentsCount: countMap.get(group._id.toString()) || 0
    }));
    
    console.log('Fetched groups:', groupsWithCount.length, 'for user role:', req.user?.role);
    console.log('Sample group:', groupsWithCount[0] ? {
      id: groupsWithCount[0]._id,
      name: groupsWithCount[0].name,
      teacherId: groupsWithCount[0].teacherId?._id || 'null',
      teacherName: (groupsWithCount[0].teacherId as any)?.fullName || 'null'
    } : 'no groups');
    
    res.json(groupsWithCount);
  } catch (error: any) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('subjectId')
      .populate('teacherId')
      .populate('branchId');
    
    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }
    
    // Проверка доступа для учителя
    if (req.user?.role === UserRole.TEACHER) {
      // Учитель может видеть только свои группы
      if (!group.teacherId || group.teacherId._id.toString() !== req.user.id) {
        return res.status(403).json({ message: 'Sizda bu guruhga kirish huquqi yo\'q' });
      }
    } else if (req.user?.role === UserRole.FIL_ADMIN) {
      // Branch admin может видеть только группы своего филиала
      if (group.branchId?._id.toString() !== req.user.branchId) {
        return res.status(403).json({ message: 'Sizda bu guruhga kirish huquqi yo\'q' });
      }
    }
    
    console.log('Fetched group:', group._id, 'for user role:', req.user?.role);
    res.json(group);
  } catch (error: any) {
    console.error('Error fetching group:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Get students in a group
router.get('/:id/students', authenticate, async (req: AuthRequest, res) => {
  try {
    const groupId = req.params.id;
    console.log('Fetching students for group:', groupId);
    
    const group = await Group.findById(groupId);
    
    if (!group) {
      console.log('Group not found:', groupId);
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }
    
    // Проверяем доступ к филиалу
    if (req.user?.role === UserRole.TEACHER) {
      if (!group.teacherId || group.teacherId.toString() !== req.user.id) {
        console.log('Teacher access denied for group:', groupId);
        return res.status(403).json({ message: 'Sizda bu guruhga kirish huquqi yo\'q' });
      }
    } else if (req.user?.role === UserRole.FIL_ADMIN) {
      if (group.branchId?.toString() !== req.user?.branchId?.toString()) {
        console.log('Branch admin access denied for group:', groupId);
        return res.status(403).json({ message: 'Sizda bu guruhga kirish huquqi yo\'q' });
      }
    }
    
    // Получаем всех студентов этой группы
    const studentGroups = await StudentGroup.find({ groupId: groupId })
      .populate({
        path: 'studentId',
        populate: [
          { path: 'branchId' },
          { path: 'directionId' },
          { path: 'subjectIds' }
        ]
      })
      .lean();
    
    console.log('Found student-group relations:', studentGroups.length);
    
    const seen = new Set<string>();
    const students = studentGroups
      .map(sg => sg.studentId)
      .filter((student: any) => {
        if (!student) return false;
        const sid = String(student._id);
        if (seen.has(sid)) return false;
        seen.add(sid);
        return true;
      });
    
    // Добавляем статистику по тестам для каждого студента
    const TestResult = (await import('../models/TestResult')).default;
    
    const studentsWithStats = await Promise.all(
      students.map(async (student: any) => {
        const testResults = await TestResult.find({ studentId: student._id }).lean();
        
        let averagePercentage = 0;
        if (testResults.length > 0) {
          const totalPercentage = testResults.reduce((sum, result) => sum + (result.percentage || 0), 0);
          averagePercentage = Math.round(totalPercentage / testResults.length);
        }
        
        return {
          ...student,
          averagePercentage,
          testsCompleted: testResults.length
        };
      })
    );
    
    console.log('Returning students with stats:', studentsWithStats.length);
    res.json(studentsWithStats);
  } catch (error: any) {
    console.error('Error fetching group students:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.post('/', authenticate, async (req: AuthRequest, res) => {
  return res.status(403).json({ message: CRM_MSG });
  try {
    console.log('Creating group:', req.body);
    const { name, classNumber, subjectId, letter, teacherId } = req.body;
    
    if (!name || !classNumber || !subjectId || !letter) {
      return res.status(400).json({ message: 'Barcha majburiy maydonlarni to\'ldiring' });
    }
    
    const group = new Group({
      branchId: req.user?.branchId,
      name,
      classNumber,
      subjectId,
      letter,
      teacherId: teacherId || undefined // Convert empty string to undefined
    });
    
    await group.save();
    console.log('Group created:', group._id);
    
    const populatedGroup = await Group.findById(group._id)
      .populate('subjectId')
      .populate('teacherId');
    
    // Инвалидируем кэш групп
    await invalidateCache('/api/groups');
    
    res.status(201).json(populatedGroup);
  } catch (error: any) {
    console.error('Error creating group:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  return res.status(403).json({ message: CRM_MSG });
  try {
    console.log('=== ОБНОВЛЕНИЕ ГРУППЫ ===');
    console.log('Group ID:', req.params.id);
    console.log('Данные:', req.body);
    console.log('TeacherId:', req.body.teacherId);
    
    const updateData = { ...req.body };
    if (updateData.teacherId === '') {
      console.log('TeacherId пустой, устанавливаем undefined');
      updateData.teacherId = undefined;
    }
    
    console.log('UpdateData после обработки:', updateData);
    
    // Получаем старую группу для сравнения
    const oldGroup = await Group.findById(req.params.id);
    
    // Сначала обновляем без populate
    const updatedGroup = await Group.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true }
    );
    
    if (!updatedGroup) {
      console.log('❌ Группа не найдена');
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }
    
    console.log('✅ Группа обновлена (raw):', {
      id: updatedGroup!._id,
      name: updatedGroup!.name,
      teacherId: updatedGroup!.teacherId || 'null'
    });

    // Если изменилась буква группы, обновляем конфигурации студентов
    if (oldGroup !== null && (oldGroup as NonNullable<typeof oldGroup>).letter !== updatedGroup!.letter) {
      const og = oldGroup as NonNullable<typeof oldGroup>;
      console.log(`🔄 Group letter changed: ${og.letter} → ${updatedGroup!.letter}`);
      
      // Находим всех студентов этой группы
      const StudentGroup = require('../models/StudentGroup').default;
      const StudentTestConfig = require('../models/StudentTestConfig').default;
      
      const studentGroups = await StudentGroup.find({ groupId: req.params.id }).lean();
      const studentIds = studentGroups.map((sg: any) => sg.studentId);
      
      console.log(`📝 Updating configs for ${studentIds.length} students`);
      
      // Обновляем groupLetter в конфигурациях студентов
      for (const studentId of studentIds) {
        const config = await StudentTestConfig.findOne({ studentId });
        
        if (config && config.subjects) {
          let updated = false;
          
          // Обновляем groupLetter для всех предметов, которые имели старую букву
          config.subjects = config.subjects.map((s: any) => {
            if (s.groupLetter === og.letter) {
              updated = true;
              return { ...s, groupLetter: updatedGroup!.letter };
            }
            return s;
          });
          
          if (updated) {
            config.markModified('subjects');
            await config.save();
            console.log(`✅ Updated config for student ${studentId}`);
          }
        }
      }
    }
    
    // Теперь загружаем с populate
    const group = await Group.findById(updatedGroup!._id)
      .populate('subjectId')
      .populate('teacherId')
      .exec();
    
    console.log('✅ Группа с populate:', {
      id: group?._id,
      name: group?.name,
      teacherId: group?.teacherId?._id || 'null',
      teacherName: (group?.teacherId as any)?.fullName || 'null'
    });
    
    // Инвалидируем кэш групп
    await invalidateCache('/api/groups');
    
    res.json(group);
  } catch (error: any) {
    console.error('❌ Error updating group:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  return res.status(403).json({ message: CRM_MSG });
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }
    
    // Каскадное удаление связанных данных
    const groupId = req.params.id;
    
    // Удаляем связи студентов с группой
    const StudentGroup = require('../models/StudentGroup').default;
    await StudentGroup.deleteMany({ groupId });
    
    // Удаляем саму группу
    await Group.findByIdAndDelete(req.params.id);
    
    // Инвалидируем кэш групп
    await invalidateCache('/api/groups');
    
    res.json({ message: 'Guruh va unga tegishli barcha ma\'lumotlar o\'chirildi' });
  } catch (error: any) {
    console.error('Error deleting group:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Get available group letters by class number
router.get('/letters/:classNumber', authenticate, async (req: AuthRequest, res) => {
  try {
    const classNumber = parseInt(req.params.classNumber);
    
    const groups = await Group.find({
      branchId: req.user?.branchId,
      classNumber
    })
      .select('letter')
      .lean();
    
    // Получаем уникальные буквы
    const letters = [...new Set(groups.map(g => g.letter))].sort();
    
    res.json(letters);
  } catch (error) {
    console.error('Error fetching group letters:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// GET /groups/:id/subject-config — group-level subject+letter config
router.get('/:id/subject-config', authenticate, async (_req: AuthRequest, res) => {
  try {
    const configs = await GroupSubjectConfig.find({ groupId: _req.params.id })
      .populate('subjectId', 'nameUzb nameRu')
      .lean();
    res.json(configs);
  } catch (error: unknown) {
    res.status(500).json({ message: 'Server xatosi', error: error instanceof Error ? error.message : String(error) });
  }
});

// PUT /groups/:id/subject-config — save group-level subject+letter config (full replace)
// Body: { configs: [{ subjectId, groupLetter }] }
router.put('/:id/subject-config', authenticate, async (req: AuthRequest, res) => {
  try {
    const groupId = req.params.id;
    const { configs } = req.body as { configs: { subjectId: string; groupLetter: string }[] };

    if (!Array.isArray(configs)) {
      return res.status(400).json({ message: 'configs array kerak' });
    }

    // subjectId bo'lganlarini ajratish
    const withSubject = configs.filter(c => c.subjectId);

    // Ro'yxatda yo'q fanlarni o'chirish (subjectId bo'yicha)
    const subjectIds = withSubject.map(c => c.subjectId);
    if (subjectIds.length > 0) {
      await GroupSubjectConfig.deleteMany({ groupId, subjectId: { $nin: subjectIds } });
    }

    // Barcha fanlarni upsert qilish (harfi bor/yo'q)
    const ops = withSubject.map(({ subjectId, groupLetter }) => ({
      updateOne: {
        filter: { groupId, subjectId },
        update: groupLetter
          ? { $set: { groupLetter } }
          : { $unset: { groupLetter: 1 } },
        upsert: true
      }
    }));

    if (ops.length > 0) await GroupSubjectConfig.bulkWrite(ops);

    // Guruh konfiguratsiyasi o'zgardi — barcha blok test variantlarini o'chirish
    try {
      const blockTests = await BlockTest.find({ groupId }).select('_id').lean();
      if (blockTests.length > 0) {
        const btIds = blockTests.map(bt => bt._id);
        const sup = await StudentVariant.updateMany(
          { testId: { $in: btIds }, superseded: { $ne: true } },
          { $set: { superseded: true, supersededAt: new Date() } }
        );
        if (sup.modifiedCount > 0) {
          console.log(`♻️ Superseded ${sup.modifiedCount} stale variants (group subject-config changed)`);
        }
      }
    } catch (e) {
      console.error('Variant cleanup error:', e);
    }

    res.json({ message: 'Saqlandi' });
  } catch (error: unknown) {
    res.status(500).json({ message: 'Server xatosi', error: error instanceof Error ? error.message : String(error) });
  }
});

// GET /groups/:id/student-letters — per-student subject+letter assignments for this group
router.get('/:id/student-letters', authenticate, async (req: AuthRequest, res) => {
  try {
    const assignments = await StudentGroup.find({ groupId: req.params.id })
      .select('studentId subjectId groupLetter')
      .lean();
    res.json(assignments);
  } catch (error: unknown) {
    res.status(500).json({ message: 'Server xatosi', error: error instanceof Error ? error.message : String(error) });
  }
});

// PUT /groups/:id/student-letters — bulk upsert per-student letters
// Body: { letters: [{ studentId, subjectId, groupLetter }] }
router.put('/:id/student-letters', authenticate, async (req: AuthRequest, res) => {
  try {
    const groupId = req.params.id;
    const { letters } = req.body as { letters: { studentId: string; subjectId: string; groupLetter: string }[] };

    if (!Array.isArray(letters)) {
      return res.status(400).json({ message: 'letters array kerak' });
    }

    const valid = letters.filter(l => l.studentId && l.subjectId);
    const withLetter = valid.filter(l => l.groupLetter);
    const withoutLetter = valid.filter(l => !l.groupLetter);

    // Harfli yozuvlarni saqlash — mavjud recordni yangilash, yangi yaratmaslik
    for (const { studentId, subjectId, groupLetter } of withLetter) {
      // 1) Try exact match (studentId + groupId + subjectId)
      const exact = await StudentGroup.updateOne(
        { studentId, groupId, subjectId },
        { $set: { groupLetter } }
      );
      if (exact.matchedCount > 0) continue;

      // 2) Try base record (no subjectId) — set subjectId on it
      const base = await StudentGroup.updateOne(
        { studentId, groupId, subjectId: { $exists: false } },
        { $set: { subjectId, groupLetter } }
      );
      if (base.matchedCount > 0) continue;

      // 3) Try base record with null subjectId
      const baseNull = await StudentGroup.updateOne(
        { studentId, groupId, subjectId: null },
        { $set: { subjectId, groupLetter } }
      );
      if (baseNull.matchedCount > 0) continue;

      // 4) No record found — create new (shouldn't normally happen)
      await StudentGroup.create({ studentId, groupId, subjectId, groupLetter });
    }

    // Bo'sh harflar — mavjud yozuvdan groupLetter ni olib tashlash
    for (const { studentId, subjectId } of withoutLetter) {
      await StudentGroup.updateOne(
        { studentId, groupId, subjectId },
        { $unset: { groupLetter: 1 } }
      );
    }

    // O'zgargan o'quvchilar uchun eskirgan variantlarni o'chirish
    try {
      const affectedStudentIds = [...new Set(letters.filter(l => l.studentId).map(l => l.studentId))];
      if (affectedStudentIds.length > 0) {
        const blockTests = await BlockTest.find({ groupId }).select('_id').lean();
        if (blockTests.length > 0) {
          const btIds = blockTests.map(bt => bt._id);
          const sup = await StudentVariant.updateMany(
            { testId: { $in: btIds }, studentId: { $in: affectedStudentIds }, superseded: { $ne: true } },
            { $set: { superseded: true, supersededAt: new Date() } }
          );
          if (sup.modifiedCount > 0) {
            console.log(`♻️ Superseded ${sup.modifiedCount} stale variants for ${affectedStudentIds.length} students (letters changed)`);
          }
        }
      }
    } catch (e) {
      console.error('Variant cleanup error:', e);
    }

    res.json({ message: 'Saqlandi' });
  } catch (error: unknown) {
    res.status(500).json({ message: 'Server xatosi', error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
