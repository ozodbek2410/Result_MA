import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import Group from '../models/Group';
import Student from '../models/Student';
import StudentGroup from '../models/StudentGroup';
import TestResult from '../models/TestResult';

const router = express.Router();

/**
 * Роуты для роли MANAGER
 * Менеджер может управлять группами и студентами
 */

// ============= ГРУППЫ =============

// Получить все группы
router.get('/groups', authenticate, requirePermission('view_groups'), async (req: AuthRequest, res) => {
  try {
    const filter: any = {};
    
    // Если не Super Admin, показываем только группы своего филиала
    if (req.user?.role !== 'SUPER_ADMIN') {
      filter.branchId = req.user?.branchId;
    }
    
    const groups = await Group.find(filter)
      .populate('branchId')
      .populate('subjectId')
      .populate('teacherId')
      .sort({ name: 1 });
    
    res.json(groups);
  } catch (error: any) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Создать группу
router.post('/groups', authenticate, requirePermission('create_groups'), async (req: AuthRequest, res) => {
  try {
    const groupData = {
      ...req.body,
      branchId: req.user?.branchId // Автоматически привязываем к филиалу менеджера
    };
    
    const group = new Group(groupData);
    await group.save();
    
    const populatedGroup = await Group.findById(group._id)
      .populate('branchId')
      .populate('teacherId')
      .populate('directionId');
    
    res.status(201).json(populatedGroup);
  } catch (error: any) {
    console.error('Error creating group:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Обновить группу
router.put('/groups/:id', authenticate, requirePermission('edit_groups'), async (req: AuthRequest, res) => {
  try {
    const group = await Group.findById(req.params.id);
    
    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }
    
    // Проверяем, что группа принадлежит филиалу менеджера
    if (req.user?.role !== 'SUPER_ADMIN' && group.branchId?.toString() !== req.user?.branchId?.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    Object.assign(group, req.body);
    await group.save();
    
    const populatedGroup = await Group.findById(group._id)
      .populate('branchId')
      .populate('teacherId')
      .populate('directionId');
    
    res.json(populatedGroup);
  } catch (error: any) {
    console.error('Error updating group:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Удалить группу
router.delete('/groups/:id', authenticate, requirePermission('delete_groups'), async (req: AuthRequest, res) => {
  try {
    const group = await Group.findById(req.params.id);
    
    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }
    
    // Проверяем, что группа принадлежит филиалу менеджера
    if (req.user?.role !== 'SUPER_ADMIN' && group.branchId?.toString() !== req.user?.branchId?.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Каскадное удаление связанных данных
    const groupId = req.params.id;
    
    // Удаляем связи студентов с группой
    const StudentGroup = require('../models/StudentGroup').default;
    await StudentGroup.deleteMany({ groupId });
    
    // Удаляем саму группу
    await Group.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Guruh va unga tegishli barcha ma\'lumotlar o\'chirildi' });
  } catch (error: any) {
    console.error('Error deleting group:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// ============= СТУДЕНТЫ =============

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
      .sort({ fullName: 1 })
      .lean();
    
    // Загружаем группы для каждого студента - OPTIMIZED: Single query instead of N queries
    const allStudentIds = students.map((s: any) => s._id);
    const allStudentGroups = await StudentGroup.find({ 
      studentId: { $in: allStudentIds } 
    })
      .populate({
        path: 'groupId',
        select: 'name subjectId classNumber letter',
        populate: {
          path: 'subjectId',
          select: 'nameUzb'
        }
      })
      .lean();
    
    // Create map for O(1) lookup
    const groupsByStudent = new Map<string, any[]>();
    allStudentGroups.forEach((sg: any) => {
      const studentId = sg.studentId.toString();
      if (!groupsByStudent.has(studentId)) {
        groupsByStudent.set(studentId, []);
      }
      // Фильтруем только валидные группы (где groupId не null)
      if (sg.groupId != null) {
        groupsByStudent.get(studentId)!.push({
          _id: sg.groupId._id,
          name: sg.groupId.name,
          subjectId: sg.groupId.subjectId,
          classNumber: sg.groupId.classNumber,
          letter: sg.groupId.letter
        });
      }
    });
    
    // Map students with their groups
    const studentsWithGroups = students.map((student: any) => ({
      ...student,
      groups: groupsByStudent.get(student._id.toString()) || []
    }));
    
    res.json(studentsWithGroups);
  } catch (error: any) {
    console.error('Error fetching students:', error);
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

// Создать студента
router.post('/students', authenticate, requirePermission('create_students'), async (req: AuthRequest, res) => {
  try {
    const { groups, ...studentData } = req.body;
    
    const student = new Student({
      ...studentData,
      branchId: req.user?.branchId, // Автоматически привязываем к филиалу менеджера
      profileToken: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    });
    await student.save();
    
    // Добавляем студента в группы
    if (groups && Array.isArray(groups) && groups.length > 0) {
      const studentGroups = groups.map((g: any) => ({
        studentId: student._id,
        groupId: g.groupId,
        subjectId: g.subjectId
      }));
      await StudentGroup.insertMany(studentGroups);
    }
    
    const populatedStudent = await Student.findById(student._id)
      .populate('branchId')
      .populate('directionId')
      .populate('subjectIds');
    
    res.status(201).json({
      ...populatedStudent?.toObject(),
      profileUrl: `/p/${student.profileToken}`
    });
  } catch (error: any) {
    console.error('Error creating student:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Обновить студента
router.put('/students/:id', authenticate, requirePermission('edit_students'), async (req: AuthRequest, res) => {
  try {
    const { groups, ...updateData } = req.body;
    
    const student = await Student.findById(req.params.id);
    
    if (!student) {
      return res.status(404).json({ message: 'O\'quvchi topilmadi' });
    }
    
    // Проверяем, что студент принадлежит филиалу менеджера
    if (req.user?.role !== 'SUPER_ADMIN' && student.branchId?.toString() !== req.user?.branchId?.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    Object.assign(student, updateData);
    await student.save();
    
    // Обновляем группы студента
    if (groups && Array.isArray(groups)) {
      // Удаляем старые связи
      await StudentGroup.deleteMany({ studentId: student._id });
      
      // Добавляем новые
      if (groups.length > 0) {
        const studentGroups = groups.map((g: any) => ({
          studentId: student._id,
          groupId: g.groupId,
          subjectId: g.subjectId
        }));
        await StudentGroup.insertMany(studentGroups);
      }
    }
    
    const populatedStudent = await Student.findById(student._id)
      .populate('branchId')
      .populate('directionId')
      .populate('subjectIds');
    
    res.json(populatedStudent);
  } catch (error: any) {
    console.error('Error updating student:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Удалить студента
router.delete('/students/:id', authenticate, requirePermission('delete_students'), async (req: AuthRequest, res) => {
  try {
    const student = await Student.findById(req.params.id);
    
    if (!student) {
      return res.status(404).json({ message: 'O\'quvchi topilmadi' });
    }
    
    // Проверяем, что студент принадлежит филиалу менеджера
    if (req.user?.role !== 'SUPER_ADMIN' && student.branchId?.toString() !== req.user?.branchId?.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Каскадное удаление связанных данных
    const studentId = req.params.id;
    
    // Удаляем результаты тестов студента
    const TestResult = require('../models/TestResult').default;
    await TestResult.deleteMany({ studentId });
    
    // Удаляем конфигурации тестов студента
    const StudentTestConfig = require('../models/StudentTestConfig').default;
    await StudentTestConfig.deleteMany({ studentId });
    
    // Удаляем варианты студента
    const StudentVariant = require('../models/StudentVariant').default;
    await StudentVariant.deleteMany({ studentId });
    
    // Удаляем связи студента с группами
    const StudentGroup = require('../models/StudentGroup').default;
    await StudentGroup.deleteMany({ studentId });
    
    // Удаляем логи активности студента
    const StudentActivityLog = require('../models/StudentActivityLog').default;
    await StudentActivityLog.deleteMany({ studentId });
    
    // Удаляем самого студента
    await Student.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'O\'quvchi va unga tegishli barcha ma\'lumotlar o\'chirildi' });
  } catch (error: any) {
    console.error('Error deleting student:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Добавить студента в группу
router.post('/students/:studentId/groups/:groupId', 
  authenticate, 
  requirePermission('edit_students'), 
  async (req: AuthRequest, res) => {
    try {
      const { studentId, groupId } = req.params;
      
      // Проверяем существование студента и группы
      const student = await Student.findById(studentId);
      const group = await Group.findById(groupId);
      
      if (!student || !group) {
        return res.status(404).json({ message: 'O\'quvchi yoki guruh topilmadi' });
      }
      
      // Проверяем права доступа
      if (req.user?.role !== 'SUPER_ADMIN') {
        if (student.branchId?.toString() !== req.user?.branchId?.toString() ||
            group.branchId?.toString() !== req.user?.branchId?.toString()) {
          return res.status(403).json({ message: 'Access denied' });
        }
      }
      
      // Проверяем, не добавлен ли уже студент в группу
      const existing = await StudentGroup.findOne({ studentId, groupId });
      if (existing) {
        return res.status(400).json({ message: 'O\'quvchi allaqachon guruhda' });
      }
      
      const studentGroup = new StudentGroup({ studentId, groupId });
      await studentGroup.save();
      
      res.status(201).json({ message: 'O\'quvchi guruhga qo\'shildi' });
    } catch (error: any) {
      console.error('Error adding student to group:', error);
      res.status(500).json({ message: 'Server xatosi', error: error.message });
    }
  }
);

// Удалить студента из группы
router.delete('/students/:studentId/groups/:groupId', 
  authenticate, 
  requirePermission('edit_students'), 
  async (req: AuthRequest, res) => {
    try {
      const { studentId, groupId } = req.params;
      
      const studentGroup = await StudentGroup.findOne({ studentId, groupId });
      
      if (!studentGroup) {
        return res.status(404).json({ message: 'O\'quvchi guruhda emas' });
      }
      
      await StudentGroup.findByIdAndDelete(studentGroup._id);
      
      res.json({ message: 'O\'quvchi guruhdan o\'chirildi' });
    } catch (error: any) {
      console.error('Error removing student from group:', error);
      res.status(500).json({ message: 'Server xatosi', error: error.message });
    }
  }
);

export default router;
