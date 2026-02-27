import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import Group from '../models/Group';
import Student from '../models/Student';
import StudentGroup from '../models/StudentGroup';
import Test from '../models/Test';
import BlockTest from '../models/BlockTest';
import { Assignment } from '../models/Assignment';
import TestResult from '../models/TestResult';

const router = express.Router();

/**
 * Роуты для роли OBSERVER
 * Наблюдатель имеет доступ только на чтение данных
 */

// ============= DASHBOARD =============

// Получить статистику для дашборда
router.get('/dashboard', authenticate, requirePermission('view_dashboard'), async (req: AuthRequest, res) => {
  try {
    const filter: any = {};
    
    // Если не Super Admin, показываем только данные своего филиала
    if (req.user?.role !== 'SUPER_ADMIN') {
      filter.branchId = req.user?.branchId;
    }
    
    const [groupsCount, studentsCount, testsCount] = await Promise.all([
      Group.countDocuments(filter),
      Student.countDocuments(filter),
      Test.countDocuments(filter.branchId ? { createdBy: req.user?.id } : {})
    ]);
    
    res.json({
      groupsCount,
      studentsCount,
      testsCount
    });
  } catch (error: any) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// ============= СТАТИСТИКА =============

// Получить общую статистику
router.get('/statistics', authenticate, requirePermission('view_statistics'), async (req: AuthRequest, res) => {
  try {
    const filter: any = {};
    
    if (req.user?.role !== 'SUPER_ADMIN') {
      filter.branchId = req.user?.branchId;
    }
    
    const [groups, students, tests, assignments] = await Promise.all([
      Group.find(filter).populate('branchId').populate('subjectId').populate('teacherId').lean(),
      Student.find(filter).populate('branchId').lean(),
      Test.find(filter.branchId ? { createdBy: req.user?.id } : {}).populate('subjectId').lean(),
      Assignment.find(filter.branchId ? { createdBy: req.user?.id } : {})
        .populate('testId')
        .populate('groupId')
        .lean()
    ]);
    
    res.json({
      groups,
      students,
      tests,
      assignments
    });
  } catch (error: any) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// ============= ГРУППЫ (только просмотр) =============

// Получить все группы
router.get('/groups', authenticate, requirePermission('view_groups'), async (req: AuthRequest, res) => {
  try {
    const filter: any = {};
    
    if (req.user?.role !== 'SUPER_ADMIN') {
      filter.branchId = req.user?.branchId;
    }
    
    const groups = await Group.find(filter)
      .populate('branchId')
      .populate('subjectId')
      .populate('teacherId')
      .sort({ name: 1 })
      .lean();
    
    res.json(groups);
  } catch (error: any) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Получить группу по ID
router.get('/groups/:id', authenticate, requirePermission('view_groups'), async (req: AuthRequest, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('branchId')
      .populate('subjectId')
      .populate('teacherId');
    
    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }
    
    // Проверяем доступ к филиалу
    if (req.user?.role !== 'SUPER_ADMIN' && group.branchId?._id?.toString() !== req.user?.branchId?.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    res.json(group);
  } catch (error: any) {
    console.error('Error fetching group:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Получить студентов группы
router.get('/groups/:id/students', authenticate, requirePermission('view_groups'), async (req: AuthRequest, res) => {
  try {
    const groupId = req.params.id;
    console.log('Fetching students for group:', groupId);
    
    const group = await Group.findById(groupId);
    
    if (!group) {
      console.log('Group not found:', groupId);
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }
    
    // Проверяем доступ к филиалу
    if (req.user?.role !== 'SUPER_ADMIN' && group.branchId?.toString() !== req.user?.branchId?.toString()) {
      console.log('Access denied for group:', groupId);
      return res.status(403).json({ message: 'Access denied' });
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
    
    // Получаем результаты тестов для каждого студента
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

// Получить все связи студент-группа
router.get('/student-groups', authenticate, requirePermission('view_groups'), async (req: AuthRequest, res) => {
  try {
    const filter: any = {};
    
    // Если не Super Admin, фильтруем по филиалу через группу
    if (req.user?.role !== 'SUPER_ADMIN') {
      const groups = await Group.find({ branchId: req.user?.branchId }).select('_id');
      const groupIds = groups.map(g => g._id);
      filter.groupId = { $in: groupIds };
    }
    
    const studentGroups = await StudentGroup.find(filter)
      .populate('studentId')
      .populate('groupId');
    
    res.json(studentGroups);
  } catch (error: any) {
    console.error('Error fetching student-groups:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// ============= СТУДЕНТЫ (только просмотр) =============

// Получить всех студентов
router.get('/students', authenticate, requirePermission('view_students'), async (req: AuthRequest, res) => {
  try {
    const filter: any = {};
    
    if (req.user?.role !== 'SUPER_ADMIN') {
      filter.branchId = req.user?.branchId;
    }
    
    // Для FIL_ADMIN и SUPER_ADMIN показываем всех, включая выпускников
    // Для остальных - только активных учеников
    if (req.user?.role !== 'SUPER_ADMIN' && req.user?.role !== 'FIL_ADMIN') {
      filter.isGraduated = { $ne: true };
    }
    
    // Фильтр по классу
    const classNumber = req.query.classNumber as string;
    if (classNumber) {
      filter.classNumber = parseInt(classNumber);
    }
    
    // Фильтр по предмету
    const subjectId = req.query.subjectId as string;
    if (subjectId) {
      filter.subjectIds = subjectId;
    }
    
    // Если передан groupId, фильтруем по группе
    const groupId = req.query.groupId as string;
    let studentIds: any[] | undefined;
    
    if (groupId) {
      // Получаем студентов из StudentGroup
      const studentGroups = await StudentGroup.find({ groupId }).select('studentId');
      studentIds = studentGroups.map(sg => sg.studentId);
      
      if (studentIds.length === 0) {
        // Если в группе нет студентов, возвращаем пустой массив
        return res.json([]);
      }
      
      filter._id = { $in: studentIds };
    }
    
    const students = await Student.find(filter)
      .populate('branchId')
      .populate('directionId')
      .populate('subjectIds')
      .sort({ fullName: 1 });
    
    // Загружаем группы для каждого студента
    const studentsWithGroups = await Promise.all(students.map(async (student) => {
      const studentGroups = await StudentGroup.find({ studentId: student._id })
        .populate({
          path: 'groupId',
          select: 'name subjectId classNumber letter',
          populate: {
            path: 'subjectId',
            select: 'nameUzb'
          }
        });
      
      return {
        ...student.toObject(),
        groups: studentGroups
          .filter(sg => sg.groupId != null)
          .map(sg => {
            const group = sg.groupId as any;
            return {
              _id: group._id,
              name: group.name,
              subjectId: group.subjectId,
              classNumber: group.classNumber,
              letter: group.letter
            };
          })
      };
    }));
    
    res.json(studentsWithGroups);
  } catch (error: any) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Получить студента по ID
router.get('/students/:id', authenticate, requirePermission('view_students'), async (req: AuthRequest, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('branchId', 'name location')
      .lean()
      .exec();
    
    if (!student) {
      return res.status(404).json({ message: 'O\'quvchi topilmadi' });
    }
    
    // Проверяем доступ к филиалу
    if (req.user?.role !== 'SUPER_ADMIN' && student.branchId?._id?.toString() !== req.user?.branchId?.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    res.json(student);
  } catch (error: any) {
    console.error('Error fetching student:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Получить полный профиль студента с группами и тестами
router.get('/students/:id/profile', authenticate, requirePermission('view_students'), async (req: AuthRequest, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('branchId', 'name')
      .populate('directionId', 'nameUzb')
      .populate('subjectIds', 'nameUzb')
      .lean();
    
    if (!student) {
      return res.status(404).json({ message: 'O\'quvchi topilmadi' });
    }
    
    // Проверяем доступ к филиалу
    if (req.user?.role !== 'SUPER_ADMIN' && student.branchId?._id?.toString() !== req.user?.branchId?.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Получаем группы студента
    const studentGroups = await StudentGroup.find({ studentId: student._id })
      .populate({
        path: 'groupId',
        select: 'name letter classNumber',
        populate: {
          path: 'subjectId',
          select: 'nameUzb'
        }
      })
      .lean();
    
    const groups = studentGroups.map((sg: any) => ({
      _id: sg.groupId?._id,
      groupName: sg.groupId?.name,
      letter: sg.groupId?.letter,
      subjectName: sg.groupId?.subjectId?.nameUzb
    })).filter(g => g._id);
    
    // Получаем результаты тестов
    const testResults = await TestResult.find({ studentId: student._id })
      .populate('testId', 'name')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    const recentTests = testResults.map((result: any) => ({
      _id: result._id,
      testName: result.testId?.name || 'Test',
      score: result.totalPoints || 0,
      maxScore: result.maxPoints || 0,
      percentage: result.percentage || 0,
      createdAt: result.createdAt
    }));
    
    // Вычисляем статистику
    const completedTests = testResults.length;
    const avgPercentage = completedTests > 0
      ? Math.round(testResults.reduce((sum: number, r: any) => sum + (r.percentage || 0), 0) / completedTests)
      : 0;
    
    res.json({
      ...student,
      groups,
      groupsCount: groups.length,
      recentTests,
      completedTests,
      avgPercentage
    });
  } catch (error: any) {
    console.error('Error fetching student profile:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// ============= ТЕСТЫ (только просмотр) =============

// Получить все тесты
router.get('/tests', authenticate, requirePermission('view_tests'), async (req: AuthRequest, res) => {
  try {
    const filter: any = {};
    
    const tests = await Test.find(filter)
      .populate('subjectId')
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 });
    
    res.json(tests);
  } catch (error: any) {
    console.error('Error fetching tests:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Получить тест по ID
router.get('/tests/:id', authenticate, requirePermission('view_tests'), async (req: AuthRequest, res) => {
  try {
    const test = await Test.findById(req.params.id)
      .populate('subjectId')
      .populate('createdBy', 'username');
    
    if (!test) {
      return res.status(404).json({ message: 'Test topilmadi' });
    }
    
    res.json(test);
  } catch (error: any) {
    console.error('Error fetching test:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// ============= БЛОК-ТЕСТЫ (только просмотр) =============

// Получить все блок-тесты
router.get('/block-tests', authenticate, requirePermission('view_tests'), async (req: AuthRequest, res) => {
  try {
    const blockTests = await BlockTest.find()
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 });
    
    res.json(blockTests);
  } catch (error: any) {
    console.error('Error fetching block tests:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Получить блок-тест по ID
router.get('/block-tests/:id', authenticate, requirePermission('view_tests'), async (req: AuthRequest, res) => {
  try {
    const blockTest = await BlockTest.findById(req.params.id)
      .populate('createdBy', 'username');
    
    if (!blockTest) {
      return res.status(404).json({ message: 'Blok test topilmadi' });
    }
    
    res.json(blockTest);
  } catch (error: any) {
    console.error('Error fetching block test:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// ============= ЗАДАНИЯ (только просмотр) =============

// Получить все задания
router.get('/assignments', authenticate, requirePermission('view_tests'), async (req: AuthRequest, res) => {
  try {
    const assignments = await Assignment.find()
      .populate('testId')
      .populate('groupId')
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 });
    
    res.json(assignments);
  } catch (error: any) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Получить результаты тестов
router.get('/test-results', authenticate, requirePermission('view_tests'), async (req: AuthRequest, res) => {
  try {
    const filter: any = {};
    
    // Если не Super Admin, показываем только данные своего филиала
    if (req.user?.role !== 'SUPER_ADMIN' && req.user?.branchId) {
      filter.branchId = req.user.branchId;
    }
    
    const results = await TestResult.find(filter)
      .populate('studentId')
      .populate('testId')
      .sort({ createdAt: -1 });
    
    res.json(results);
  } catch (error: any) {
    console.error('Error fetching test results:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

export default router;
