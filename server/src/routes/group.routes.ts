import express from 'express';
import Group from '../models/Group';
import StudentGroup from '../models/StudentGroup';
import { authenticate, AuthRequest } from '../middleware/auth';
import { UserRole } from '../models/User';
import { invalidateCache } from '../middleware/cache';

const router = express.Router();

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const filter: any = {};
    
    // Фильтрация по роли
    if (req.user?.role === UserRole.TEACHER) {
      filter.teacherId = req.user?.teacherId;
    } else if (req.user?.role !== UserRole.SUPER_ADMIN) {
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
    let filteredGroups = groups;
    if (req.user?.role === UserRole.TEACHER) {
      filteredGroups = groups.filter(group => 
        group.teacherId && 
        group.teacherId._id.toString() === req.user?.teacherId
      );
    }
    
    // Получаем количество учеников одним запросом
    const groupIds = filteredGroups.map(g => g._id);
    const studentCounts = await StudentGroup.aggregate([
      { $match: { groupId: { $in: groupIds } } },
      { $group: { _id: '$groupId', count: { $sum: 1 } } }
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
      if (!group.teacherId || group.teacherId._id.toString() !== req.user.teacherId) {
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
      if (!group.teacherId || group.teacherId.toString() !== req.user.teacherId) {
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
    
    const students = studentGroups
      .map(sg => sg.studentId)
      .filter(student => student != null);
    
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
      id: updatedGroup._id,
      name: updatedGroup.name,
      teacherId: updatedGroup.teacherId || 'null'
    });
    
    // Теперь загружаем с populate
    const group = await Group.findById(updatedGroup._id)
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

export default router;
