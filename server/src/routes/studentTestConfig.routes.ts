import express from 'express';
import mongoose from 'mongoose';
import StudentTestConfig from '../models/StudentTestConfig';
import Student from '../models/Student';
import StudentGroup from '../models/StudentGroup';
import Direction from '../models/Direction';
import Subject from '../models/Subject';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Batch endpoint GET - получить конфигурации для нескольких студентов
router.get('/batch', authenticate, async (req: AuthRequest, res) => {
  try {
    const { studentIds } = req.query;
    
    if (!studentIds || typeof studentIds !== 'string') {
      return res.status(400).json({ message: 'studentIds параметр керак' });
    }
    
    const idsArray = studentIds.split(',').filter(id => id.trim());
    
    if (idsArray.length === 0) {
      return res.json([]);
    }
    
    // Ограничиваем до 1000 студентов за раз
    const limitedIds = idsArray.slice(0, 1000);
    
    // Получаем все конфигурации одним запросом с populate
    const configs = await StudentTestConfig.find({
      studentId: { $in: limitedIds }
    })
      .populate('subjects.subjectId')
      .lean();
    
    res.json(configs);
  } catch (error: any) {
    console.error('Batch config GET error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Batch endpoint - получить конфигурации для нескольких студентов
router.post('/batch', authenticate, async (req: AuthRequest, res) => {
  try {
    const { studentIds } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds)) {
      return res.status(400).json({ message: 'studentIds массив керак' });
    }
    
    // Ограничиваем до 50 студентов за раз
    const limitedIds = studentIds.slice(0, 50);
    
    // Получаем все конфигурации одним запросом
    const configs = await StudentTestConfig.find({
      studentId: { $in: limitedIds }
    })
      .populate('subjects.subjectId')
      .lean();
    
    // Создаем map для быстрого доступа
    const configMap: Record<string, any> = {};
    configs.forEach(config => {
      configMap[config.studentId.toString()] = config;
    });
    
    // Возвращаем в том же порядке, что и запрос
    const result = limitedIds.map(id => configMap[id] || null);
    
    res.json(result);
  } catch (error: any) {
    console.error('Batch config error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Создать дефолтную конфигурацию для ученика на основе блок-теста
router.post('/create-for-block-test/:studentId/:blockTestId', authenticate, async (req: AuthRequest, res) => {
  try {
    const student = await Student.findById(req.params.studentId);
    
    if (!student) {
      return res.status(404).json({ message: 'O\'quvchi topilmadi' });
    }
    
    // Загружаем блок-тест
    const BlockTest = (await import('../models/BlockTest')).default;
    const blockTest = await BlockTest.findById(req.params.blockTestId);
    
    if (!blockTest) {
      return res.status(404).json({ message: 'Blok test topilmadi' });
    }
    
    // Загружаем все блок-тесты с той же датой и классом
    const testDate = new Date(blockTest.date);
    testDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(testDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    const sameGroupTests = await BlockTest.find({
      classNumber: blockTest.classNumber,
      date: {
        $gte: testDate,
        $lt: nextDay
      }
    }).populate('subjectTests.subjectId');
    
    // Собираем все уникальные предметы из всех тестов группы
    const subjectMap = new Map();
    
    for (const test of sameGroupTests) {
      if (test.subjectTests) {
        for (const st of test.subjectTests) {
          if (st.subjectId && st.questions && st.questions.length > 0) {
            const subjectId = st.subjectId._id.toString();
            if (!subjectMap.has(subjectId)) {
              subjectMap.set(subjectId, {
                subjectId: st.subjectId._id,
                maxQuestions: st.questions.length
              });
            }
          }
        }
      }
    }
    
    const subjects = Array.from(subjectMap.values());
    
    if (subjects.length === 0) {
      return res.status(400).json({ message: 'Blok testda fanlar topilmadi' });
    }
    
    // Получаем букву группы студента
    let studentGroupLetter = null;
    try {
      const studentGroup = await StudentGroup.findOne({ studentId: student._id })
        .populate<{ groupId: { letter: string } }>('groupId', 'letter')
        .lean();
      
      studentGroupLetter = studentGroup?.groupId?.letter || null;
      console.log(`🔍 Creating config for student ${student.fullName}, group letter: ${studentGroupLetter || 'umumiy'}, studentGroup:`, studentGroup);
    } catch (groupError) {
      console.error('Error loading student group:', groupError);
      // Продолжаем без буквы группы
    }
    
    // Дефолтное общее количество вопросов
    const DEFAULT_TOTAL_QUESTIONS = 90;
    
    // Равномерное распределение вопросов
    const baseQuestions = Math.floor(DEFAULT_TOTAL_QUESTIONS / subjects.length);
    const remainder = DEFAULT_TOTAL_QUESTIONS % subjects.length;
    
    const configSubjects = subjects.map((subject, index) => {
      const questionCount = baseQuestions + (index < remainder ? 1 : 0);
      return {
        subjectId: subject.subjectId,
        questionCount: Math.min(questionCount, subject.maxQuestions),
        groupLetter: studentGroupLetter || undefined, // Добавляем букву группы
        isAdditional: false
      };
    });
    
    // Пересчитываем реальное количество вопросов
    const actualTotal = configSubjects.reduce((sum, s) => sum + s.questionCount, 0);
    
    // Дефолтная конфигурация баллов
    const defaultPointsConfig = [
      { from: 1, to: actualTotal, points: 3.1 }
    ];
    
    // Удаляем старую конфигурацию если есть
    await StudentTestConfig.findOneAndDelete({ studentId: req.params.studentId });
    
    // Создаем новую конфигурацию
    const config = new StudentTestConfig({
      studentId: student._id,
      branchId: student.branchId,
      totalQuestions: actualTotal,
      subjects: configSubjects,
      pointsConfig: defaultPointsConfig
    });
    
    await config.save();
    
    // Populate и возвращаем
    const populatedConfig = await StudentTestConfig.findById(config._id)
      .populate('subjects.subjectId');
    
    res.json(populatedConfig);
  } catch (error: any) {
    console.error('Error creating config for block test:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Создать дефолтную конфигурацию для ученика
router.post('/create-default/:studentId', authenticate, async (req: AuthRequest, res) => {
  try {
    const student = await Student.findById(req.params.studentId);
    
    if (!student) {
      return res.status(404).json({ message: 'O\'quvchi topilmadi' });
    }
    
    // Проверяем, нет ли уже конфигурации
    const existing = await StudentTestConfig.findOne({ studentId: req.params.studentId });
    if (existing) {
      return res.json(existing);
    }
    
    // Создаем дефолтную конфигурацию
    const config = await createDefaultConfig(student);
    
    res.json(config);
  } catch (error: any) {
    console.error('Error creating default config:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Получить настройки ученика
router.get('/:studentId', authenticate, async (req: AuthRequest, res) => {
  try {
    let config = await StudentTestConfig.findOne({ studentId: req.params.studentId })
      .populate('subjects.subjectId');
    
    // Если конфигурации нет, создаем дефолтную
    if (!config) {
      console.log(`Config not found for student ${req.params.studentId}, creating default...`);
      
      const student = await Student.findById(req.params.studentId);
      if (!student) {
        return res.status(404).json({ message: 'O\'quvchi topilmadi' });
      }
      
      try {
        config = await createDefaultConfig(student);
        config = await StudentTestConfig.findById(config._id).populate('subjects.subjectId');
      } catch (error: any) {
        console.error('Error creating default config:', error);
        // Если не удалось создать конфигурацию, возвращаем пустую
        return res.json({
          studentId: req.params.studentId,
          totalQuestions: 0,
          subjects: [],
          pointsConfig: []
        });
      }
    }
    
    res.json(config);
  } catch (error: any) {
    console.error('Error fetching student config:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Создать или обновить настройки ученика
router.put('/:studentId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { totalQuestions, subjects, pointsConfig } = req.body;
    
    // Валидация
    if (!totalQuestions || totalQuestions < 1) {
      return res.status(400).json({ message: 'Umumiy savollar soni noto\'g\'ri' });
    }
    
    if (!subjects || subjects.length === 0) {
      return res.status(400).json({ message: 'Fanlar ro\'yxati bo\'sh' });
    }
    
    // Проверяем что сумма вопросов равна totalQuestions
    const totalCount = subjects.reduce((sum: number, s: any) => sum + s.questionCount, 0);
    if (totalCount !== totalQuestions) {
      return res.status(400).json({ 
        message: `Savollar soni mos kelmaydi: ${totalCount} !== ${totalQuestions}` 
      });
    }
    
    // Получаем студента для branchId
    const student = await Student.findById(req.params.studentId);
    if (!student) {
      return res.status(404).json({ message: 'O\'quvchi topilmadi' });
    }
    
    // Обновляем или создаем конфигурацию
    const config = await StudentTestConfig.findOneAndUpdate(
      { studentId: req.params.studentId },
      {
        studentId: req.params.studentId,
        branchId: student.branchId,
        totalQuestions,
        subjects,
        pointsConfig: pointsConfig || []
      },
      { upsert: true, new: true }
    ).populate('subjects.subjectId');
    
    res.json(config);
  } catch (error: any) {
    console.error('Error saving student config:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Сброс настроек ученика
router.post('/reset/:studentId', authenticate, async (req: AuthRequest, res) => {
  try {
    const student = await Student.findById(req.params.studentId)
      .populate('directionId');
    
    if (!student) {
      return res.status(404).json({ message: 'O\'quvchi topilmadi' });
    }
    
    // Удаляем существующую конфигурацию
    await StudentTestConfig.findOneAndDelete({ studentId: req.params.studentId });
    
    res.json({ message: 'Sozlamalar tiklandi' });
  } catch (error: any) {
    console.error('Error resetting student config:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Сброс настроек для всех учеников класса
router.post('/reset-class/:classNumber', authenticate, async (req: AuthRequest, res) => {
  try {
    const { classNumber } = req.params;
    
    // Находим всех учеников класса (исключая выпускников)
    const students = await Student.find({ 
      branchId: req.user?.branchId,
      classNumber: parseInt(classNumber),
      isGraduated: { $ne: true }
    });
    
    const studentIds = students.map(s => s._id);
    
    // Удаляем все конфигурации
    await StudentTestConfig.deleteMany({ studentId: { $in: studentIds } });
    
    res.json({ 
      message: 'Barcha sozlamalar tiklandi',
      count: studentIds.length 
    });
  } catch (error: any) {
    console.error('Error resetting class configs:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Применить настройки к блок-тесту
router.post('/apply-to-block-test/:blockTestId', authenticate, async (req: AuthRequest, res) => {
  try {
    const BlockTest = (await import('../models/BlockTest')).default;
    
    const blockTest = await BlockTest.findById(req.params.blockTestId);
    if (!blockTest) {
      return res.status(404).json({ message: 'Blok test topilmadi' });
    }
    
    // Получаем всех учеников класса (исключая выпускников)
    const students = await Student.find({
      branchId: req.user?.branchId,
      classNumber: blockTest.classNumber,
      isGraduated: { $ne: true }
    });
    
    // Для каждого ученика получаем или создаем конфигурацию
    const studentConfigs = [];
    
    for (const student of students) {
      let config = await StudentTestConfig.findOne({ studentId: student._id })
        .populate('subjects.subjectId');
      
      // Если конфигурации нет, создаем дефолтную
      if (!config) {
        config = await createDefaultConfig(student);
      }
      
      studentConfigs.push({
        studentId: student._id,
        subjects: config.subjects.map((s: any) => ({
          subjectId: s.subjectId._id,
          questionCount: s.questionCount,
          pointsConfig: config.pointsConfig
        }))
      });
    }
    
    // Обновляем блок-тест
    blockTest.studentConfigs = studentConfigs as any;
    await blockTest.save();
    
    res.json({ 
      message: 'Sozlamalar qo\'llanildi',
      studentsCount: studentConfigs.length 
    });
  } catch (error: any) {
    console.error('Error applying configs to block test:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Вспомогательная функция для создания дефолтной конфигурации
async function createDefaultConfig(student: any) {
  const populatedStudent = await Student.findById(student._id)
    .populate('directionId');
  
  if (!populatedStudent || !populatedStudent.directionId) {
    throw new Error('Student direction not found');
  }
  
  const direction = await Direction.findById(populatedStudent.directionId)
    .populate('subjects');
  
  if (!direction) {
    throw new Error('Direction not found');
  }
  
  // Получаем обязательные предметы
  const mandatorySubjects = await Subject.find({ isMandatory: true, isActive: true });
  
  // Собираем все предметы направления (включая choice)
  const directionSubjectIds: Set<string> = new Set();
  
  for (const subjectChoice of direction.subjects) {
    if (subjectChoice.type === 'single') {
      // Один обязательный предмет
      subjectChoice.subjectIds.forEach((id: any) => directionSubjectIds.add(id.toString()));
    } else if (subjectChoice.type === 'choice') {
      // Предметы на выбор - берем выбранные студентом
      const studentSubjects = populatedStudent.subjectIds || [];
      subjectChoice.subjectIds.forEach((id: any) => {
        if (studentSubjects.some((sid: any) => sid.toString() === id.toString())) {
          directionSubjectIds.add(id.toString());
        }
      });
    }
  }
  
  // Добавляем обязательные предметы (исключая дубликаты)
  const allSubjectIds = new Set([...directionSubjectIds]);
  mandatorySubjects.forEach(s => allSubjectIds.add(s._id.toString()));
  
  // Дефолтное общее количество вопросов
  const DEFAULT_TOTAL_QUESTIONS = 90;
  const subjectCount = allSubjectIds.size;
  
  if (subjectCount === 0) {
    throw new Error('No subjects found for student');
  }
  
  // Равномерное распределение вопросов
  const baseQuestions = Math.floor(DEFAULT_TOTAL_QUESTIONS / subjectCount);
  const remainder = DEFAULT_TOTAL_QUESTIONS % subjectCount;
  
  const subjects = Array.from(allSubjectIds).map((subjectId, index) => ({
    subjectId: new mongoose.Types.ObjectId(subjectId),
    questionCount: baseQuestions + (index < remainder ? 1 : 0),
    isAdditional: false
  }));
  
  // Дефолтная конфигурация баллов (можно настроить)
  const defaultPointsConfig = [
    { from: 1, to: DEFAULT_TOTAL_QUESTIONS, points: 3.1 }
  ];
  
  const config = new StudentTestConfig({
    studentId: student._id,
    branchId: student.branchId,
    totalQuestions: DEFAULT_TOTAL_QUESTIONS,
    subjects,
    pointsConfig: defaultPointsConfig
  });
  
  await config.save();
  return config;
}

export default router;
