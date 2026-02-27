import express from 'express';
import Student from '../models/Student';
import StudentGroup from '../models/StudentGroup';
import TestResult from '../models/TestResult';

const router = express.Router();

router.get('/profile/:token', async (req, res) => {
  try {
    console.log('🔍 Fetching public profile for token:', req.params.token);
    
    const student = await Student.findOne({ profileToken: req.params.token })
      .populate('directionId')
      .populate('subjectIds')
      .lean();
    
    if (!student) {
      console.log('❌ Student not found for token:', req.params.token);
      return res.status(404).json({ message: 'Profil topilmadi' });
    }
    
    console.log('✅ Student found:', student.fullName, 'ID:', student._id);
    
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
    
    console.log('📚 Groups found:', groups.length);
    
    // Получаем результаты тестов (старая система)
    const testResults = await TestResult.find({ studentId: student._id })
      .populate('testId')
      .sort({ createdAt: -1 })
      .lean();
    
    console.log('📝 TestResults found:', testResults.length);
    
    // Получаем результаты заданий (новая система - assignments)
    const { AssignmentSubmission } = await import('../models/Assignment');
    const assignmentResults = await AssignmentSubmission.find({ 
      studentId: student._id,
      percentage: { $exists: true, $ne: null }
    })
      .populate({
        path: 'assignmentId',
        select: 'title type createdAt'
      })
      .sort({ gradedAt: -1 })
      .lean();
    
    console.log('📋 AssignmentSubmissions found:', assignmentResults.length);
    
    // ТАКЖЕ получаем оценки из Student.grades (на случай если AssignmentSubmission не синхронизирован)
    const studentWithGrades = await Student.findById(student._id).select('grades').lean();
    const gradesFromStudent = studentWithGrades?.grades || [];
    
    console.log('🎓 Student.grades found:', gradesFromStudent.length);
    
    // Объединяем результаты тестов и заданий
    const allResults = [
      // TestResults (старая система)
      ...testResults.map(r => {
        const test = r.testId as any;
        return {
          _id: r._id,
          type: 'test',
          name: test?.name || 'Test',
          percentage: r.percentage,
          totalPoints: r.totalPoints,
          maxPoints: r.maxPoints,
          createdAt: r.createdAt
        };
      }),
      // AssignmentSubmissions (новая система)
      ...assignmentResults.map((r: any) => ({
        _id: r._id,
        type: 'assignment',
        name: r.assignmentId?.title || 'Topshiriq',
        percentage: r.percentage,
        totalPoints: r.percentage,
        maxPoints: 100,
        createdAt: r.gradedAt || r.createdAt
      })),
      // Student.grades (резервный источник)
      ...gradesFromStudent.map((g: any) => ({
        _id: g._id || g.assignmentId,
        type: 'grade',
        name: 'Topshiriq',
        percentage: g.percentage,
        totalPoints: g.percentage,
        maxPoints: 100,
        createdAt: g.gradedAt
      }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    const avgPercentage = allResults.length > 0
      ? allResults.reduce((sum, r) => sum + r.percentage, 0) / allResults.length
      : 0;
    
    console.log('📊 Total results:', allResults.length, 'Average:', Math.round(avgPercentage) + '%');
    
    // Disable caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json({
      student: {
        _id: student._id,
        fullName: student.fullName,
        classNumber: student.classNumber,
        direction: student.directionId
      },
      groups,
      groupsCount: groups.length,
      avgPercentage: Math.round(avgPercentage),
      results: allResults,
      testResults,
      assignmentResults
    });
  } catch (error) {
    console.error('❌ Error fetching profile:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// Получение деталей результата теста
router.get('/test-result/:resultId/:token', async (req, res) => {
  try {
    const { resultId, token } = req.params;
    
    // Проверяем токен студента
    const student = await Student.findOne({ profileToken: token });
    if (!student) {
      return res.status(404).json({ message: 'Profil topilmadi' });
    }
    
    // Получаем результат теста с полной информацией
    const result = await TestResult.findById(resultId)
      .populate({
        path: 'testId',
        populate: {
          path: 'questions'
        }
      })
      .populate('variantId');
    
    if (!result) {
      return res.status(404).json({ message: 'Natija topilmadi' });
    }
    
    // Проверяем, что результат принадлежит этому студенту
    if (result.studentId.toString() !== student._id.toString()) {
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching test result:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

export default router;
