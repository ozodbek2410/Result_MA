import express from 'express';
import Test from '../models/Test';
import StudentVariant from '../models/StudentVariant';
import StudentGroup from '../models/StudentGroup';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, AuthRequest } from '../middleware/auth';
import { UserRole } from '../models/User';
import { cacheMiddleware, invalidateCache } from '../middleware/cache';
import multer from 'multer';
import path from 'path';
import { TestImportService } from '../services/testImportService';

const router = express.Router();

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
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

router.get('/', authenticate, cacheMiddleware(180), async (req: AuthRequest, res) => {
  try {
    const filter: any = {};
    
    // Filter by branch for non-super admins
    if (req.user?.branchId) {
      filter.branchId = req.user.branchId;
    }
    
    // Filter by teacher if user is a teacher
    if (req.user?.role === 'TEACHER') {
      filter.createdBy = req.user.id;
    }
    
    // Optimized query - exclude questions from list
    const tests = await Test.find(filter)
      .populate('groupId', 'name classNumber letter')
      .populate('subjectId', 'nameUzb nameRu')
      .populate('createdBy', 'fullName')
      .select('-questions')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    
    console.log('Fetched tests:', tests.length);
    res.json(tests);
  } catch (error: any) {
    console.error('Error fetching tests:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.get('/:id', authenticate, cacheMiddleware(300), async (req, res) => {
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
    
    res.json(test);
  } catch (error: any) {
    console.error('Error fetching test:', error);
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
    
    // Инвалидируем кэш списка тестов
    await invalidateCache('/api/tests');
    
    res.status(201).json(test);
  } catch (error) {
    res.status(500).json({ message: 'Server xatosi' });
  }
});

router.post('/:id/generate-variants', authenticate, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ message: 'Test topilmadi' });
    }

    const studentGroups = await StudentGroup.find({ groupId: test.groupId })
      .populate('studentId', 'fullName classNumber')
      .lean()
      .exec();
    
    await StudentVariant.deleteMany({ testId: test._id });
    
    const variants = [];
    for (const sg of studentGroups) {
      const variantCode = uuidv4().substring(0, 8).toUpperCase();
      const questionOrder = shuffleArray([...Array(test.questions.length).keys()]);
      
      // Simple QR payload - just variant code (easy to scan)
      // Full data can be retrieved via API using this code
      const qrPayload = variantCode;
      
      const variant = new StudentVariant({
        testId: test._id,
        studentId: sg.studentId._id,
        variantCode,
        qrPayload,
        questionOrder
      });
      
      await variant.save();
      variants.push(variant);
    }
    
    res.json({ message: 'Variantlar yaratildi', count: variants.length, variants });
  } catch (error) {
    res.status(500).json({ message: 'Server xatosi' });
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
    
    // Инвалидируем кэш
    await invalidateCache('/api/tests');
    
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
    
    // Инвалидируем кэш
    await invalidateCache('/api/tests');
    
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

    let questions;
    let logs: any[] = [];
    
    try {
      questions = await TestImportService.importTest(req.file.path, format);
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

    if (!questions || questions.length === 0) {
      return res.status(400).json({ message: 'Savollar topilmadi' });
    }

    if (!groupId) {
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

    console.log('Imported test saved:', test._id);
    res.status(201).json({ 
      message: 'Test muvaffaqiyatli saqlandi',
      test
    });
  } catch (error: any) {
    console.error('Error saving imported test:', error);
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

    for (let i = 0; i < test.questions.length; i++) {
      const originalQuestionIndex = studentVariant.questionOrder[i];
      const question = test.questions[originalQuestionIndex];
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

function shuffleArray(array: any[]) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default router;
