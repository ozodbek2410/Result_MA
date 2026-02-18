import express from 'express';
import Test from '../models/Test';
import StudentVariant from '../models/StudentVariant';
import StudentGroup from '../models/StudentGroup';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, AuthRequest } from '../middleware/auth';
import { UserRole } from '../models/User';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { TestImportService } from '../services/testImportService';
import { PDFExportService } from '../services/pdfExportService';
import { PDFGeneratorService } from '../services/pdfGeneratorService';
import { PandocDocxService } from '../services/pandocDocxService';
import { convertTiptapJsonToText } from '../utils/textUtils';
import { convertVariantText } from '../utils/tiptapConverter';
import wordExportQueue from '../services/queue/wordExportQueue';
import pdfExportQueue from '../services/queue/pdfExportQueue';
import { S3Service } from '../services/s3Service';

const router = express.Router();

// Определяем базовую директорию сервера
// __dirname в скомпилированном коде: /var/www/resultMA/server/dist/routes
// Поднимаемся на 2 уровня вверх: /var/www/resultMA/server
const SERVER_ROOT = path.join(__dirname, '..', '..');

// Multer configuration for file uploads
const uploadDir = path.join(SERVER_ROOT, 'uploads');

// Создаем директорию если не существует
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('✅ Upload directory ready:', uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /doc|docx|pdf|jpg|jpeg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Faqat Word, PDF va rasm fayllari qabul qilinadi!'));
    }
  }
});

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const fields = req.query.fields as string;
    const filter: any = {};
    
    // Filter by branch for non-super admins
    if (req.user?.branchId) {
      filter.branchId = req.user.branchId;
    }
    
    // Filter by teacher if user is a teacher
    if (req.user?.role === 'TEACHER') {
      filter.createdBy = req.user.id;
    }
    
    console.log('🔍 Fetching tests with filter:', filter);
    
    let query = Test.find(filter);
    
    // Поддержка разных уровней детализации
    if (fields === 'minimal') {
      query = query.select('name createdAt _id');
    } else if (fields === 'full') {
      query = query
        .populate('groupId', 'name classNumber letter')
        .populate('subjectId', 'nameUzb nameRu');
    } else {
      // По умолчанию - минимальные данные
      query = query.select('name createdAt _id');
    }
    
    const tests = await query
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    
    console.log(`✅ Found ${tests.length} tests (${fields || 'minimal'})`);
    
    // Отключаем все виды кэширования
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json(tests);
  } catch (error: any) {
    console.error('❌ Error fetching tests:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id)
      .populate('groupId', 'name classNumber letter')
      .populate('subjectId', 'nameUzb nameRu')
      .populate('createdBy', 'fullName')
      .lean()
      .exec();
    
    if (!test) {
      return res.status(404).json({ message: 'Test topilmadi' });
    }
    
    // Отключаем кэширование
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json(test);
  } catch (error: any) {
    console.error('Error fetching test:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Get test with shuffled variants for specific student
router.get('/:id/student/:studentId', authenticate, async (req, res) => {
  try {
    const { id: testId, studentId } = req.params;
    
    console.log('🔍 Fetching test with shuffled variants:', { testId, studentId });
    
    // Find student variant
    const studentVariant = await StudentVariant.findOne({
      testId,
      studentId
    }).lean();
    
    if (!studentVariant) {
      console.log('❌ Student variant not found, returning original test');
      // If no variant exists, return original test
      const test = await Test.findById(testId)
        .populate('groupId', 'name classNumber letter')
        .populate('subjectId', 'nameUzb nameRu')
        .populate('createdBy', 'fullName')
        .lean();
      
      return res.json(test);
    }
    
    // Get original test
    const test = await Test.findById(testId)
      .populate('groupId', 'name classNumber letter')
      .populate('subjectId', 'nameUzb nameRu')
      .populate('createdBy', 'fullName')
      .lean();
    
    if (!test) {
      return res.status(404).json({ message: 'Test topilmadi' });
    }
    
    console.log('✅ Found student variant with shuffled questions');
    
    // Return test with shuffled questions from variant
    const testWithShuffledVariants = {
      ...test,
      questions: studentVariant.shuffledQuestions || test.questions,
      variantCode: studentVariant.variantCode,
      hasShuffledVariants: !!studentVariant.shuffledQuestions
    };
    
    // Отключаем кэширование
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json(testWithShuffledVariants);
  } catch (error: any) {
    console.error('❌ Error fetching test with shuffled variants:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const test = new Test({
      ...req.body,
      branchId: req.user?.branchId,
      createdBy: req.user?.id
    });
    await test.save();
    
    // Автоматически генерируем варианты после создания теста
    if (test.groupId) {
      try {
        const studentGroups = await StudentGroup.find({ groupId: test.groupId })
          .populate('studentId', 'fullName classNumber')
          .lean()
          .exec();
        
        const variants = [];
        
        for (const sg of studentGroups) {
          const variantCode = uuidv4().substring(0, 8).toUpperCase();
          
          // 1. Перемешиваем порядок вопросов
          const questionIndices = [...Array(test.questions.length).keys()];
          const shuffledQuestionIndices = shuffleArray(questionIndices);
          
          // 2. Для каждого вопроса перемешиваем варианты ответов
          const shuffledQuestions = shuffledQuestionIndices.map((qIndex) => {
            const originalQuestion = test.questions[qIndex];
            
            // Перемешиваем варианты ответов используя ту же функцию
            const shuffledQuestion = shuffleQuestionVariants(originalQuestion);
            
            return {
              ...shuffledQuestion,
              originalQuestionIndex: qIndex
            };
          });
          
          const qrPayload = variantCode;
          
          const variant = new StudentVariant({
            testId: test._id,
            studentId: sg.studentId._id,
            variantCode,
            qrPayload,
            questionOrder: shuffledQuestionIndices,
            shuffledQuestions
          });
          
          variant.markModified('shuffledQuestions');
          await variant.save();
          variants.push(variant);
        }
        
        console.log(`✅ Auto-generated ${variants.length} variants for test ${test._id}`);
      } catch (variantError) {
        console.error('❌ Error auto-generating variants:', variantError);
        // Не прерываем создание теста, если не удалось создать варианты
      }
    }
    
    res.status(201).json(test);
  } catch (error) {
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// Helper function to shuffle answer variants (A, B, C, D) - SAME AS BLOCK TESTS
router.post('/:id/generate-variants', authenticate, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id).lean();
    if (!test) {
      return res.status(404).json({ message: 'Test topilmadi' });
    }

    console.log('🔄 Generating variants for test:', test._id);
    console.log('📋 Test has', test.questions?.length || 0, 'questions');

    if (!test.questions || test.questions.length === 0) {
      return res.status(400).json({ message: 'Test savollar mavjud emas' });
    }

    if (!test.groupId) {
      return res.status(400).json({ message: 'Test guruhga biriktirilmagan' });
    }

    const studentGroups = await StudentGroup.find({ groupId: test.groupId })
      .populate('studentId', 'fullName classNumber')
      .lean()
      .exec();
    
    console.log('👥 Found', studentGroups.length, 'students in group');

    if (studentGroups.length === 0) {
      return res.status(400).json({ message: 'Guruhda talabalar topilmadi' });
    }
    
    // Удаляем старые варианты
    const deleteResult = await StudentVariant.deleteMany({ testId: test._id });
    console.log('🗑️ Deleted', deleteResult.deletedCount, 'old variants');
    
    const variants = [];
    
    for (const sg of studentGroups) {
      // Проверяем что studentId существует
      if (!sg.studentId || !(sg.studentId as any)._id) {
        console.log('⚠️ Skipping student group without valid studentId:', sg);
        continue;
      }

      const student = sg.studentId as any;
      const variantCode = uuidv4().substring(0, 8).toUpperCase();
      
      // 1. Перемешиваем порядок вопросов
      const questionIndices = [...Array(test.questions.length).keys()];
      const shuffledQuestionIndices = shuffleArray(questionIndices);
      
      console.log(`\n👤 Student: ${student.fullName || 'Unknown'}`);
      console.log('🔢 Question order:', shuffledQuestionIndices);
      
      // 2. Для каждого вопроса перемешиваем варианты ответов
      const shuffledQuestions = shuffledQuestionIndices.map((qIndex) => {
        const originalQuestion = test.questions[qIndex];
        
        console.log(`\n📝 Question ${qIndex + 1}:`, originalQuestion.text?.substring(0, 50));
        
        // Перемешиваем варианты ответов
        const shuffledQuestion = shuffleQuestionVariants(originalQuestion);
        
        return {
          ...shuffledQuestion,
          originalQuestionIndex: qIndex
        };
      });
      
      const qrPayload = variantCode;
      
      const variant = new StudentVariant({
        testId: test._id,
        studentId: student._id,
        variantCode,
        qrPayload,
        questionOrder: shuffledQuestionIndices,
        shuffledQuestions
      });
      
      // Явно помечаем поле как измененное (для Mixed типов)
      variant.markModified('shuffledQuestions');
      
      await variant.save();
      
      // Проверяем что сохранилось
      const savedVariant = await StudentVariant.findById(variant._id).lean();
      console.log(`\n💾 SAVED variant for ${student.fullName || 'Unknown'}:`, {
        variantCode: savedVariant?.variantCode,
        hasShuffledQuestions: !!savedVariant?.shuffledQuestions,
        questionsCount: savedVariant?.shuffledQuestions?.length || 0,
        firstQuestion: savedVariant?.shuffledQuestions?.[0] ? {
          text: savedVariant.shuffledQuestions[0].text?.substring(0, 30),
          correctAnswer: savedVariant.shuffledQuestions[0].correctAnswer,
          variants: savedVariant.shuffledQuestions[0].variants?.map((v: any) => 
            `${v.letter}: ${v.text?.substring(0, 15)}`
          )
        } : null
      });
      
      variants.push(variant);
    }
    
    console.log(`\n✅ Generated ${variants.length} variants for test ${test._id}`);
    
    res.json({ 
      message: 'Variantlar yaratildi', 
      count: variants.length
    });
  } catch (error: any) {
    console.error('❌ Error generating variants:', error);
    console.error('❌ Stack:', error.stack);
    res.status(500).json({ 
      message: 'Server xatosi', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

router.get('/:id/variants', authenticate, async (req, res) => {
  try {
    const variants = await StudentVariant.find({ testId: req.params.id })
      .populate('studentId', 'fullName classNumber')
      .select('variantCode studentId testId createdAt')
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    res.json(variants);
  } catch (error: any) {
    console.error('Error fetching variants:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const test = await Test.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('groupId')
      .populate('subjectId');
    
    if (!test) {
      return res.status(404).json({ message: 'Test topilmadi' });
    }
    
    console.log('Test updated:', test._id);
    res.json(test);
  } catch (error: any) {
    console.error('Error updating test:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const test = await Test.findByIdAndDelete(req.params.id);
    
    if (!test) {
      return res.status(404).json({ message: 'Test topilmadi' });
    }
    
    // Also delete related student variants
    await StudentVariant.deleteMany({ testId: req.params.id });
    
    console.log('Test deleted:', req.params.id);
    res.json({ message: 'Test o\'chirildi' });
  } catch (error: any) {
    console.error('Error deleting test:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Import test from file
router.post('/import', authenticate, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    console.log('=== Import Request ===');
    console.log('File:', req.file);
    console.log('Body:', req.body);

    if (!req.file) {
      return res.status(400).json({ message: 'Fayl yuklanmadi' });
    }

    const format = req.body.format as 'word' | 'image';
    if (!format) {
      return res.status(400).json({ message: 'Format ko\'rsatilmagan' });
    }

    console.log('Importing test from file:', req.file.path, 'format:', format);
    console.log('File size:', req.file.size, 'bytes');
    console.log('File mimetype:', req.file.mimetype);

    // Используем абсолютный путь для надежности
    const absolutePath = path.isAbsolute(req.file.path) 
      ? req.file.path 
      : path.join(SERVER_ROOT, req.file.path);
    
    console.log('Absolute file path:', absolutePath);

    let questions;
    let logs: any[] = [];
    
    try {
      questions = await TestImportService.importTest(absolutePath, format);
      logs = TestImportService.getParsingLogs();
    } catch (parseError: any) {
      console.error('Parse error:', parseError);
      logs = TestImportService.getParsingLogs();
      return res.status(400).json({ 
        message: parseError.message || 'Faylni tahlil qilishda xatolik',
        details: parseError.toString(),
        logs
      });
    }

    if (!questions || questions.length === 0) {
      return res.status(400).json({ 
        message: 'Faylda savollar topilmadi. Iltimos, fayl formatini tekshiring.',
        hint: 'Savollar 1., 2., 3. formatida raqamlanishi va A), B), C), D) variantlari bo\'lishi kerak.',
        logs
      });
    }

    console.log('Successfully parsed questions:', questions.length);
    res.json({ 
      message: 'Fayl muvaffaqiyatli tahlil qilindi',
      questions,
      count: questions.length,
      logs
    });
  } catch (error: any) {
    console.error('Error importing test:', error);
    const logs = TestImportService.getParsingLogs();
    res.status(500).json({ 
      message: error.message || 'Import xatosi',
      details: error.toString(),
      logs
    });
  }
});

// Confirm and save imported test
router.post('/import/confirm', authenticate, async (req: AuthRequest, res) => {
  try {
    const { questions, testName, groupId, subjectId, classNumber } = req.body;

    console.log('🔍 Import test request:', {
      testName,
      groupId,
      subjectId,
      classNumber,
      questionsCount: questions?.length
    });
    console.log('🔍 User info:', {
      userId: req.user?.id,
      branchId: req.user?.branchId,
      role: req.user?.role
    });

    if (!questions || questions.length === 0) {
      console.log('❌ No questions provided');
      return res.status(400).json({ message: 'Savollar topilmadi' });
    }

    if (!groupId) {
      console.log('❌ No groupId provided');
      return res.status(400).json({ message: 'Guruh tanlanmagan' });
    }

    const test = new Test({
      name: testName || 'Yuklangan test',
      groupId,
      subjectId,
      classNumber: classNumber || 7,
      questions,
      branchId: req.user?.branchId,
      createdBy: req.user?.id
    });

    await test.save();

    console.log('✅ Test saved successfully:', {
      testId: test._id,
      name: test.name,
      branchId: test.branchId,
      createdBy: test.createdBy,
      questionsCount: test.questions.length
    });

    // Автоматически генерируем варианты после создания теста
    if (test.groupId) {
      try {
        console.log('🔄 Auto-generating variants for imported test...');
        
        const studentGroups = await StudentGroup.find({ groupId: test.groupId })
          .populate('studentId', 'fullName classNumber')
          .lean()
          .exec();
        
        console.log(`📋 Found ${studentGroups.length} students in group`);
        
        const variants = [];
        for (const sg of studentGroups) {
          const variantCode = uuidv4().substring(0, 8).toUpperCase();
          const questionOrder = shuffleArray([...Array(test.questions.length).keys()]);
          
          // Перемешиваем ответы для каждого вопроса
          const shuffledQuestions = questionOrder.map((qIndex) => {
            const originalQuestion = test.questions[qIndex] as any;
            
            if (!originalQuestion.variants || !originalQuestion.correctAnswer) {
              return {
                ...originalQuestion,
                originalQuestionIndex: qIndex
              };
            }
            
            const answerIndices = [...Array(originalQuestion.variants.length).keys()];
            const shuffledAnswerIndices = shuffleArray(answerIndices);
            
            // Перемешиваем варианты И обновляем буквы A, B, C, D
            const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
            const shuffledVariants = shuffledAnswerIndices.map((idx, newIdx) => ({
              ...originalQuestion.variants[idx],
              letter: letters[newIdx] // Обновляем букву на новую позицию
            }));
            
            const originalCorrectIndex = originalQuestion.correctAnswer.charCodeAt(0) - 65;
            const newCorrectIndex = shuffledAnswerIndices.indexOf(originalCorrectIndex);
            const newCorrectAnswer = String.fromCharCode(65 + newCorrectIndex);
            
            return {
              ...originalQuestion,
              variants: shuffledVariants,
              correctAnswer: newCorrectAnswer,
              originalQuestionIndex: qIndex
            };
          });
          
          const qrPayload = variantCode;
          
          const variant = new StudentVariant({
            testId: test._id,
            studentId: sg.studentId._id,
            variantCode,
            qrPayload,
            questionOrder,
            shuffledQuestions
          });
          
          await variant.save();
          variants.push(variant);
        }
        
        console.log(`✅ Auto-generated ${variants.length} variants for imported test ${test._id}`);
      } catch (variantError) {
        console.error('❌ Error auto-generating variants:', variantError);
        // Не прерываем создание теста, если не удалось создать варианты
      }
    }

    res.status(201).json({ 
      message: 'Test muvaffaqiyatli saqlandi',
      test
    });
  } catch (error: any) {
    console.error('❌ Error saving imported test:', error);
    res.status(500).json({ message: 'Saqlashda xatolik', error: error.message });
  }
});

// Get Groq API keys statistics
router.get('/import/stats', authenticate, async (req: AuthRequest, res) => {
  try {
    const stats = TestImportService.getGroqStats();
    res.json(stats);
  } catch (error: any) {
    console.error('Error getting stats:', error);
    res.status(500).json({ message: 'Statistikani olishda xatolik' });
  }
});

// Save scanned test results
router.post('/scan-results', authenticate, async (req: AuthRequest, res) => {
  try {
    const { student_id, test_id, variant, answers } = req.body;

    if (!student_id || !test_id || !variant || !answers) {
      return res.status(400).json({ message: 'Noto\'liq ma\'lumotlar' });
    }

    // Find the test and variant
    const test = await Test.findById(test_id);
    if (!test) {
      return res.status(404).json({ message: 'Test topilmadi' });
    }

    const studentVariant = await StudentVariant.findOne({
      testId: test_id,
      studentId: student_id,
      variantCode: variant
    });

    if (!studentVariant) {
      return res.status(404).json({ message: 'Student varianti topilmadi' });
    }

    // Calculate results
    const TestResult = (await import('../models/TestResult')).default;
    const processedAnswers = [];
    let totalPoints = 0;
    const maxPoints = test.questions.length;

    // Use shuffled questions if available
    const questionsToCheck = studentVariant.shuffledQuestions || test.questions;
    
    console.log('🔍 Checking answers with:', {
      hasShuffledQuestions: !!studentVariant.shuffledQuestions,
      totalQuestions: questionsToCheck.length
    });

    for (let i = 0; i < questionsToCheck.length; i++) {
      const question = questionsToCheck[i];
      const studentAnswer = answers[(i + 1).toString()];
      
      const isCorrect = studentAnswer === question.correctAnswer;
      const points = isCorrect ? 1 : 0;
      
      if (isCorrect) totalPoints++;

      processedAnswers.push({
        questionIndex: i,
        selectedAnswer: studentAnswer === 'empty' || studentAnswer === 'invalid' ? undefined : studentAnswer,
        isCorrect,
        points
      });
      
      if (i < 3) {
        console.log(`Question ${i + 1}:`, {
          correctAnswer: question.correctAnswer,
          studentAnswer,
          isCorrect
        });
      }
    }

    const percentage = (totalPoints / maxPoints) * 100;

    // Check if result already exists
    let testResult = await TestResult.findOne({
      testId: test_id,
      studentId: student_id,
      variantId: studentVariant._id
    });

    if (testResult) {
      // Update existing result
      testResult.answers = processedAnswers;
      testResult.totalPoints = totalPoints;
      testResult.maxPoints = maxPoints;
      testResult.percentage = percentage;
      testResult.scannedAt = new Date();
      await testResult.save();
    } else {
      // Create new result
      testResult = new TestResult({
        testId: test_id,
        studentId: student_id,
        variantId: studentVariant._id,
        answers: processedAnswers,
        totalPoints,
        maxPoints,
        percentage,
        scannedAt: new Date()
      });
      await testResult.save();
    }

    console.log('Scan result saved:', testResult._id);
    res.json({ 
      message: 'Natijalar saqlandi',
      result: testResult
    });
  } catch (error: any) {
    console.error('Error saving scan results:', error);
    res.status(500).json({ message: 'Natijalarni saqlashda xatolik', error: error.message });
  }
});

// Helper function to shuffle answer variants (A, B, C, D) - SAME AS BLOCK TESTS
function shuffleQuestionVariants(question: any) {
  // Если нет вариантов - возвращаем как есть
  if (!question.variants || question.variants.length === 0) {
    console.log('⚠️ Question has no variants:', question.text?.substring(0, 50));
    return question;
  }

  // Deep copy вопроса
  const shuffledQuestion = JSON.parse(JSON.stringify(question));
  
  console.log('🔀 BEFORE shuffle:', {
    text: question.text?.substring(0, 50),
    correctAnswer: question.correctAnswer,
    variants: question.variants.map((v: any) => `${v.letter}: ${v.text?.substring(0, 20)}`)
  });
  
  // Находим правильный вариант по букве
  const originalCorrectVariant = question.variants.find(
    (v: any) => v.letter === question.correctAnswer
  );
  
  if (!originalCorrectVariant) {
    console.log('⚠️ Could not find correct answer:', question.correctAnswer);
    return question;
  }
  
  console.log('✅ Original correct variant:', originalCorrectVariant.text?.substring(0, 30));
  
  // Перемешиваем массив вариантов
  const shuffledVariants = shuffleArray([...question.variants]);
  
  console.log('🔄 After shuffleArray:', shuffledVariants.map((v: any) => `${v.letter}: ${v.text?.substring(0, 20)}`));
  
  // Находим новую позицию правильного ответа (по тексту)
  const newIndex = shuffledVariants.findIndex(
    (v: any) => v.text === originalCorrectVariant.text
  );
  
  console.log('📍 Correct answer new index:', newIndex);
  
  if (newIndex !== -1) {
    // Обновляем буквы A, B, C, D на новые позиции
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const reorderedVariants = shuffledVariants.map((v: any, idx: number) => ({
      ...v,
      letter: letters[idx]
    }));
    
    // Обновляем правильный ответ на новую букву
    shuffledQuestion.correctAnswer = letters[newIndex];
    shuffledQuestion.variants = reorderedVariants;
    
    console.log('✅ AFTER shuffle:', {
      correctAnswer: shuffledQuestion.correctAnswer,
      variants: shuffledQuestion.variants.map((v: any) => `${v.letter}: ${v.text?.substring(0, 20)}`)
    });
  }
  
  return shuffledQuestion;
}

function shuffleArray(array: any[]) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ============================================================================
// PDF EXPORT - ASYNC VERSION (Production-ready with Queue)
// ============================================================================

/**
 * Start PDF export job (async)
 * POST /tests/:id/export-pdf-async
 */
router.post('/:id/export-pdf-async', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { students } = req.body;
    
    // Validation
    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ 
        message: 'O\'quvchilar tanlanmagan',
        error: 'students array is required'
      });
    }
    
    // Check access
    const test = await Test.findById(id).select('branchId name').lean();
    if (!test) {
      return res.status(404).json({ message: 'Test topilmadi' });
    }
    
    if (req.user?.branchId && test.branchId?.toString() !== req.user.branchId.toString()) {
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }
    
    // Add job to queue
    const job = await pdfExportQueue.add('export', {
      testId: id,
      studentIds: students,
      userId: req.user.id || req.user._id?.toString() || 'unknown',
      isBlockTest: false
    }, {
      priority: students.length > 50 ? 2 : 1,
      jobId: `pdf-test-${id}-${Date.now()}`
    });
    
    console.log(`✅ [API] PDF Job ${job.id} queued for test ${id} (${students.length} students)`);
    
    res.json({
      jobId: job.id,
      status: 'queued',
      message: 'PDF yaratilmoqda. Biroz kuting...',
      estimatedTime: Math.ceil(students.length * 1.5) // 1.5s per student
    });
    
  } catch (error: any) {
    console.error('❌ [API] Error queueing PDF export:', error);
    res.status(500).json({ 
      message: 'Xatolik yuz berdi',
      error: error.message 
    });
  }
});

/**
 * Check PDF export job status
 * GET /tests/pdf-export-status/:jobId
 */
router.get('/pdf-export-status/:jobId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { jobId } = req.params;
    
    const job = await pdfExportQueue.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ 
        status: 'not_found',
        message: 'Job topilmadi' 
      });
    }
    
    const state = await job.getState();
    const progress = job.progress;
    
    if (state === 'completed') {
      const result = job.returnvalue;
      return res.json({
        status: 'completed',
        progress: 100,
        result
      });
    }
    
    if (state === 'failed') {
      const error = job.failedReason;
      return res.json({
        status: 'failed',
        error: error || 'Unknown error'
      });
    }
    
    res.json({
      status: state,
      progress: progress || 0
    });
    
  } catch (error: any) {
    console.error('❌ [API] Error checking PDF job status:', error);
    res.status(500).json({ 
      message: 'Status tekshirishda xatolik',
      error: error.message 
    });
  }
});

// ============================================================================
// PDF EXPORT - SYNC VERSION (Legacy, for backward compatibility)
// ============================================================================

// Экспорт теста в PDF (с правильным рендером формул)
router.get('/:id/export-pdf', authenticate, async (req: AuthRequest, res) => {
  try {
    const testId = req.params.id;
    const studentIds = req.query.students ? (req.query.students as string).split(',') : [];
    
    console.log('📄 Exporting test to PDF with formulas:', testId, 'Students:', studentIds.length);
    
    // Загружаем тест
    const test = await Test.findById(testId)
      .populate('subjectId', 'nameUzb')
      .populate('groupId', 'name classNumber letter')
      .lean();
    
    if (!test) {
      return res.status(404).json({ message: 'Test topilmadi' });
    }
    
    // Проверка доступа
    if (req.user?.branchId && test.branchId?.toString() !== req.user.branchId.toString()) {
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }

    let testData: any;

    // Если выбраны студенты - генерируем для каждого с его вариантом
    if (studentIds.length > 0) {
      const variants = await StudentVariant.find({
        testId,
        studentId: { $in: studentIds }
      }).populate('studentId', 'fullName').lean();

      console.log('📦 Loaded', variants.length, 'variants for PDF export');

      const students = variants
        .filter(variant => variant.studentId) // Фильтруем варианты без студента
        .map(variant => {
        const questionsToRender = variant.shuffledQuestions && variant.shuffledQuestions.length > 0
          ? variant.shuffledQuestions
          : test.questions;

        const questions = (questionsToRender || []).map((q: any, index: number) => {
          const questionText = convertVariantText(q.text);
          
          const options = (q.variants || q.options || []).map((v: any) => {
            if (typeof v === 'string') return v;
            if (v.text) {
              return convertVariantText(v.text);
            }
            return '';
          });
          
          return {
            number: index + 1,
            text: questionText,
            options,
            correctAnswer: q.correctAnswer || '',
          };
        });

        return {
          studentName: (variant.studentId as any)?.fullName || 'Student',
          variantCode: variant.variantCode,
          questions
        };
      });

      testData = {
        title: test.name || 'Test',
        className: test.groupId ? `${(test.groupId as any).classNumber}-${(test.groupId as any).letter}` : '',
        subjectName: (test.subjectId as any)?.nameUzb || '',
        students
      };
    } else {
      // Старый формат - без студентов
      const questions = (test.questions || []).map((q: any, index: number) => {
        const questionText = convertVariantText(q.text);
        
        const options = (q.variants || q.options || []).map((v: any) => {
          if (typeof v === 'string') return v;
          if (v.text) {
            return convertVariantText(v.text);
          }
          return '';
        });
        
        return {
          number: index + 1,
          text: questionText,
          options,
          correctAnswer: q.correctAnswer || '',
        };
      });
      
      testData = {
        title: test.name || 'Test',
        className: test.groupId ? `${(test.groupId as any).classNumber}-${(test.groupId as any).letter}` : '',
        subjectName: (test.subjectId as any)?.nameUzb || '',
        questions
      };
    }
    
    // Генерируем PDF через Playwright + KaTeX
    const pdfBuffer = await PDFGeneratorService.generatePDF(testData);
    
    // Отправляем файл
    const filename = `test-${test.name?.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
    
    console.log('✅ PDF exported successfully with formulas');
  } catch (error: any) {
    console.error('❌ Error exporting PDF:', error);
    res.status(500).json({ message: 'PDF yaratishda xatolik', error: error.message });
  }
});

// ============================================================================
// WORD EXPORT - ASYNC VERSION (Production-ready with Queue)
// ============================================================================

/**
 * Start Word export job (async)
 * POST /tests/:id/export-docx-async
 */
router.post('/:id/export-docx-async', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { students, settings } = req.body;
    
    // Validation
    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ 
        message: 'O\'quvchilar tanlanmagan',
        error: 'students array is required'
      });
    }
    
    // Check access
    const test = await Test.findById(id).select('branchId name').lean();
    if (!test) {
      return res.status(404).json({ message: 'Test topilmadi' });
    }
    
    if (req.user?.branchId && test.branchId?.toString() !== req.user.branchId.toString()) {
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }
    
    // Add job to queue
    const job = await wordExportQueue.add('export', {
      testId: id,
      studentIds: students,
      settings: settings || {},
      userId: req.user.id || req.user._id?.toString() || 'unknown',
      isBlockTest: false
    }, {
      priority: students.length > 50 ? 2 : 1, // Lower priority for large exports
      jobId: `test-${id}-${Date.now()}` // Unique job ID
    });
    
    console.log(`✅ [API] Job ${job.id} queued for test ${id} (${students.length} students)`);
    
    res.json({
      jobId: job.id,
      status: 'queued',
      message: 'Export jarayoni boshlandi. Biroz kuting...',
      estimatedTime: Math.ceil(students.length * 0.5) // Rough estimate: 0.5s per student
    });
    
  } catch (error: any) {
    console.error('❌ [API] Error queueing export:', error);
    res.status(500).json({ 
      message: 'Xatolik yuz berdi',
      error: error.message 
    });
  }
});

/**
 * Check export job status
 * GET /tests/export-status/:jobId
 */
router.get('/export-status/:jobId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { jobId } = req.params;
    
    const job = await wordExportQueue.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ 
        message: 'Job topilmadi',
        status: 'not_found'
      });
    }
    
    const state = await job.getState();
    const progress = job.progress || 0;
    
    // Completed
    if (state === 'completed') {
      return res.json({
        status: 'completed',
        progress: 100,
        result: {
          fileUrl: job.returnvalue.fileUrl,
          fileName: job.returnvalue.fileName,
          size: job.returnvalue.size,
          studentsCount: job.returnvalue.studentsCount
        }
      });
    }
    
    // Failed
    if (state === 'failed') {
      return res.json({
        status: 'failed',
        progress: progress,
        error: job.failedReason || 'Unknown error',
        attemptsMade: job.attemptsMade,
        attemptsTotal: job.opts.attempts
      });
    }
    
    // In progress or waiting
    res.json({
      status: state, // 'waiting', 'active', 'delayed'
      progress: progress,
      message: state === 'active' ? 'Ishlanmoqda...' : 'Navbatda...'
    });
    
  } catch (error: any) {
    console.error('❌ [API] Error checking status:', error);
    res.status(500).json({ 
      message: 'Xatolik',
      error: error.message 
    });
  }
});

// ============================================================================
// WORD EXPORT - SYNC VERSION (Legacy, fallback)
// ============================================================================

// Экспорт теста в Word (с формулами)
router.get('/:id/export-docx', authenticate, async (req: AuthRequest, res) => {
  try {
    const testId = req.params.id;
    const studentIds = req.query.students ? (req.query.students as string).split(',') : [];
    
    // Получаем настройки форматирования из query параметров
    const settings = {
      fontSize: req.query.fontSize ? parseInt(req.query.fontSize as string) : undefined,
      fontFamily: req.query.fontFamily as string | undefined,
      lineHeight: req.query.lineHeight ? parseFloat(req.query.lineHeight as string) : undefined,
      columnsCount: req.query.columnsCount ? parseInt(req.query.columnsCount as string) : undefined,
      backgroundOpacity: req.query.backgroundOpacity ? parseFloat(req.query.backgroundOpacity as string) : undefined,
      backgroundImage: req.query.customBackground as string | undefined || 
                      (req.query.useDefaultLogo === 'true' ? undefined : undefined)
    };
    
    console.log('📄 Exporting test to Word with formulas:', testId, 'Students:', studentIds.length);
    console.log('🎨 Settings:', settings);
    
    // Загружаем тест
    const test = await Test.findById(testId)
      .populate('subjectId', 'nameUzb')
      .populate('groupId', 'name classNumber letter')
      .lean();
    
    if (!test) {
      return res.status(404).json({ message: 'Test topilmadi' });
    }
    
    // Проверка доступа
    if (req.user?.branchId && test.branchId?.toString() !== req.user.branchId.toString()) {
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }

    let testData: any;

    // Если выбраны студенты - генерируем для каждого с его вариантом
    if (studentIds.length > 0) {
      const variants = await StudentVariant.find({
        testId,
        studentId: { $in: studentIds }
      }).populate('studentId', 'fullName').lean();

      console.log('📦 Loaded', variants.length, 'variants for export');

      const students = variants
        .filter(variant => variant.studentId) // Фильтруем варианты без студента
        .map(variant => {
        const questionsToRender = variant.shuffledQuestions && variant.shuffledQuestions.length > 0
          ? variant.shuffledQuestions
          : test.questions;

        const questions = (questionsToRender || []).map((q: any, index: number) => {
          let questionText = '';
          if (typeof q.text === 'string') {
            try {
              const parsed = JSON.parse(q.text);
              questionText = convertTiptapToLatex(parsed);
            } catch {
              questionText = q.text;
            }
          } else {
            questionText = convertTiptapToLatex(q.text);
          }
          
          const options = (q.variants || q.options || []).map((v: any) => {
            if (typeof v === 'string') return v;
            if (v.text) {
              if (typeof v.text === 'string') {
                try {
                  const parsed = JSON.parse(v.text);
                  return convertTiptapToLatex(parsed);
                } catch {
                  return v.text;
                }
              }
              return convertTiptapToLatex(v.text);
            }
            return '';
          });
          
          return {
            number: index + 1,
            text: questionText,
            options,
            correctAnswer: q.correctAnswer || '',
          };
        });

        return {
          studentName: (variant.studentId as any)?.fullName || 'Student',
          variantCode: variant.variantCode,
          questions
        };
      });

      testData = {
        title: test.name || 'Test',
        className: test.groupId ? `${(test.groupId as any).classNumber}-${(test.groupId as any).letter}` : '',
        subjectName: (test.subjectId as any)?.nameUzb || '',
        students,
        settings // Добавляем настройки
      };
    } else {
      // Старый формат - без студентов
      const questions = (test.questions || []).map((q: any, index: number) => {
        let questionText = '';
        if (typeof q.text === 'string') {
          try {
            const parsed = JSON.parse(q.text);
            questionText = convertTiptapToLatex(parsed);
          } catch {
            questionText = q.text;
          }
        } else {
          questionText = convertTiptapToLatex(q.text);
        }
        
        const options = (q.variants || q.options || []).map((v: any) => {
          if (typeof v === 'string') return v;
          if (v.text) {
            if (typeof v.text === 'string') {
              try {
                const parsed = JSON.parse(v.text);
                return convertTiptapToLatex(parsed);
              } catch {
                return v.text;
              }
            }
            return convertTiptapToLatex(v.text);
          }
          return '';
        });
        
        return {
          number: index + 1,
          text: questionText,
          options,
          correctAnswer: q.correctAnswer || '',
        };
      });
      
      testData = {
        title: test.name || 'Test',
        className: test.groupId ? `${(test.groupId as any).classNumber}-${(test.groupId as any).letter}` : '',
        subjectName: (test.subjectId as any)?.nameUzb || '',
        questions,
        settings // Добавляем настройки
      };
    }
    
    // Генерируем Word через Pandoc (с нативными формулами)
    const docxBuffer = await PandocDocxService.generateDocx(testData);
    
    // Отправляем файл
    const filename = `test-${test.name?.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(docxBuffer);
    
    console.log('✅ Word exported successfully with formulas');
  } catch (error: any) {
    console.error('❌ Error exporting Word:', error);
    res.status(500).json({ message: 'Word yaratishda xatolik', error: error.message });
  }
});

/**
 * Конвертирует TipTap JSON в текст с LaTeX формулами
 */
/**
 * Конвертирует TipTap JSON в текст с LaTeX формулами
 * @deprecated Use convertVariantText from utils/tiptapConverter instead
 */
function convertTiptapToLatex(json: any): string {
  return convertVariantText(json);
}


export default router;
