import express from 'express';
import multer from 'multer';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import fsSync from 'fs';
import { authenticate } from '../middleware/auth';
import { invalidateCache } from '../middleware/cache';

const router = express.Router();
const execAsync = promisify(exec);

// Определяем базовую директорию сервера
// __dirname в скомпилированном коде: /var/www/resultMA/server/dist/routes
// Поднимаемся на 2 уровня вверх: /var/www/resultMA/server
const SERVER_ROOT = path.join(__dirname, '..', '..');

// Настройка multer для загрузки изображений
const uploadDir = path.join(SERVER_ROOT, 'uploads', 'omr');

// Создаем директорию если не существует (синхронно)
try {
  fsSync.mkdirSync(uploadDir, { recursive: true });
  console.log('✅ Upload directory ready:', uploadDir);
} catch (err) {
  console.error('❌ Failed to create upload directory:', err);
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'omr-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Только изображения разрешены (jpeg, jpg, png)'));
    }
  }
});

/**
 * POST /api/omr/upload
 * Загрузка изображения ответного листа
 */
router.post('/upload', authenticate, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    res.json({
      success: true,
      filePath: req.file.path,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Ошибка загрузки файла:', error);
    res.status(500).json({ error: 'Ошибка при загрузке файла' });
  }
});

/**
 * POST /api/omr/check-answers
 * Python OCR yordamida javoblarni aniqlash (omr_best.py)
 * QR-kod va javoblarni ketma-ket aniqlash
 * To'g'ri javoblar bilan solishtirish va natijani hisoblash
 */
router.post('/check-answers', authenticate, upload.single('image'), async (req, res) => {
  // Таймаут для всего запроса (60 секунд)
  const requestTimeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error('⏱️ Request timeout - 60 seconds exceeded');
      res.status(504).json({ 
        success: false,
        error: 'Request timeout',
        details: 'Processing took too long. Please try again.'
      });
    }
  }, 60000);
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Rasm yuklanmadi' });
    }

    const imagePath = req.file.path;

    console.log('🔍 1-bosqich: QR-kod skanerlash...');
    
    // 1. QR-kodni aniqlash
    let qrData = null;
    let qrFound = false;
    let variantCode = null;
    let variantInfo = null;
    
    try {
      // QR-scanner skriptini ishlatish
      const qrScriptPath = path.join(SERVER_ROOT, 'python', 'qr_scanner.py');
      
      const pythonCmd = process.env.PYTHON_PATH || 
                       (process.platform === 'win32' ? 'python' : 'python3');
      const qrCommand = `${pythonCmd} "${qrScriptPath}" "${imagePath}"`;
      
      console.log('🔍 QR scanner command:', qrCommand);
      
      // Verify QR script exists
      try {
        await fs.access(qrScriptPath);
      } catch (err) {
        console.error('❌ QR scanner script not found at:', qrScriptPath);
        throw new Error(`QR scanner script not found: ${qrScriptPath}`);
      }
      
      const { stdout: qrOutput } = await execAsync(qrCommand, { 
        timeout: 10000,
        env: { ...process.env }
      });
      
      const qrResult = JSON.parse(qrOutput.trim());
      if (qrResult.found) {
        qrFound = true;
        variantCode = qrResult.data.trim();
        console.log('✅ QR-kod topildi:', variantCode);
        
        // Variant kodidan to'liq ma'lumotlarni olish
        try {
          const StudentVariant = require('../models/StudentVariant').default;
          const Test = require('../models/Test').default;
          const BlockTest = require('../models/BlockTest').default;
          
          console.log('🔍 Variant qidirilmoqda:', variantCode);
          console.log('🔍 Variant code length:', variantCode.length);
          console.log('🔍 Variant code bytes:', Buffer.from(variantCode).toString('hex'));
          
          // Пробуем найти вариант с точным совпадением
          variantInfo = await StudentVariant.findOne({ variantCode: variantCode })
            .populate('studentId');
          
          // Если не найден, пробуем с trim и uppercase
          if (!variantInfo) {
            console.log('⚠️ Exact match not found, trying with trim and uppercase');
            const cleanedCode = variantCode.trim().toUpperCase();
            variantInfo = await StudentVariant.findOne({ 
              variantCode: { $regex: new RegExp(`^${cleanedCode}$`, 'i') }
            }).populate('studentId');
          }
          
          console.log('📊 Variant topildi:', variantInfo ? 'Ha' : 'Yo\'q');
          
          if (variantInfo) {
            console.log('📝 Variant ma\'lumotlari:', {
              variantCode: variantInfo.variantCode,
              studentId: variantInfo.studentId?._id,
              testId: variantInfo.testId,
              testType: variantInfo.testType,
              shuffledQuestionsCount: variantInfo.shuffledQuestions?.length || 0
            });
            
            // ВСЕ ДАННЫЕ БЕРЕМ ТОЛЬКО ИЗ ВАРИАНТА!
            let correctAnswers: any = {};
            
            // Проверяем наличие shuffledQuestions в варианте
            if (!variantInfo.shuffledQuestions || variantInfo.shuffledQuestions.length === 0) {
              console.log('❌ ОШИБКА: В варианте нет shuffledQuestions!');
              console.log('❌ Вариант должен содержать все вопросы с правильными ответами');
              console.log('❌ Пересоздайте варианты для этого теста');
              
              qrData = { 
                variantCode: variantCode, 
                error: 'Variant noto\'g\'ri yaratilgan - shuffledQuestions yo\'q. Variantlarni qayta yarating.',
                studentName: variantInfo.studentId?.fullName || 'Noma\'lum',
                testName: 'Xatolik'
              };
            } else {
              // Берем все вопросы из варианта
              console.log('✅ Variant dan barcha ma\'lumotlarni olamiz');
              console.log('📦 Shuffled questions count:', variantInfo.shuffledQuestions.length);
              
              // Просто берем все вопросы из варианта по порядку
              variantInfo.shuffledQuestions.forEach((question: any, index: number) => {
                correctAnswers[index + 1] = question.correctAnswer;
                
                // Детальное логирование первых 10 вопросов
                if (index < 10) {
                  console.log(`  📝 Вопрос ${index + 1}:`, {
                    text: question.text?.substring(0, 50) + '...',
                    correctAnswer: question.correctAnswer,
                    variants: question.variants?.map((v: any) => `${v.letter}: ${v.text?.substring(0, 20)}...`)
                  });
                }
              });
              
              console.log(`✅ Jami ${Object.keys(correctAnswers).length} ta to'g'ri javob (from variant)`);
              console.log('📦 First 10 correct answers:', 
                Object.keys(correctAnswers).slice(0, 10).map(key => 
                  `${key}: ${correctAnswers[parseInt(key)]}`
                ).join(', ')
              );
              
              // ВАЖНО: Проверяем что количество вопросов соответствует конфигурации студента
              if (variantInfo.testType === 'BlockTest') {
                try {
                  const StudentTestConfig = require('../models/StudentTestConfig').default;
                  const studentConfig = await StudentTestConfig.findOne({ 
                    studentId: variantInfo.studentId?._id || variantInfo.studentId 
                  });
                  
                  if (studentConfig) {
                    const expectedQuestions = studentConfig.totalQuestions || 
                      studentConfig.subjects.reduce((sum: number, s: any) => sum + s.questionCount, 0);
                    
                    if (variantInfo.shuffledQuestions.length !== expectedQuestions) {
                      console.log('⚠️⚠️⚠️ ВНИМАНИЕ! Количество вопросов не совпадает!');
                      console.log(`⚠️ В варианте: ${variantInfo.shuffledQuestions.length} вопросов`);
                      console.log(`⚠️ В конфигурации студента: ${expectedQuestions} вопросов`);
                      console.log('⚠️ РЕКОМЕНДАЦИЯ: Пересоздайте варианты для этого блок-теста!');
                      console.log('⚠️ Старые варианты могут содержать лишние вопросы по предметам, которые студент не выбрал');
                    }
                  }
                } catch (configError) {
                  console.log('⚠️ Не удалось проверить конфигурацию студента');
                }
              }
              
              // Получаем название теста только для отображения
              let testName = 'Test';
              try {
                if (variantInfo.testType === 'BlockTest') {
                  const blockTest = await BlockTest.findById(variantInfo.testId).select('name date');
                  if (blockTest) {
                    const testDate = new Date(blockTest.date);
                    const formattedDate = testDate.toLocaleDateString('uz-UZ', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit'
                    });
                    testName = `Blok Test - ${formattedDate}`;
                  }
                } else {
                  const test = await Test.findById(variantInfo.testId).select('name');
                  if (test) {
                    testName = test.name;
                  }
                }
              } catch (err) {
                console.log('⚠️ Test nomini olishda xatolik (davom etamiz)');
              }
              
              const studentName = variantInfo.studentId?.fullName || 
                                `${variantInfo.studentId?.firstName || ''} ${variantInfo.studentId?.lastName || ''}`.trim() ||
                                'Noma\'lum';
              
              qrData = {
                variantCode: variantCode,
                testId: variantInfo.testId,
                studentId: variantInfo.studentId?._id || variantInfo.studentId,
                studentName: studentName,
                testName: testName,
                correctAnswers: correctAnswers,
                questionOrder: variantInfo.questionOrder,
                totalQuestions: Object.keys(correctAnswers).length
              };
              
              console.log('✅ To\'liq ma\'lumotlar olindi:', {
                variantCode,
                studentName: qrData.studentName,
                testName: qrData.testName,
                totalQuestions: Object.keys(correctAnswers).length
              });
            }
          } else {
            console.log('⚠️ Variant topilmadi:', variantCode);
            console.log('⚠️ Variant code (raw):', JSON.stringify(variantCode));
            console.log('⚠️ Variant code (trimmed):', JSON.stringify(variantCode.trim()));
            
            // Show all variants (for debugging)
            const allVariants = await StudentVariant.find().limit(10).select('variantCode');
            console.log('📋 Available variants (first 10):', 
              allVariants.map((v: any) => `"${v.variantCode}"`).join(', '));
            
            // Пробуем найти похожие варианты
            const similarVariants = await StudentVariant.find({
              variantCode: { $regex: variantCode.substring(0, 4), $options: 'i' }
            }).limit(5).select('variantCode');
            
            if (similarVariants.length > 0) {
              console.log('🔍 Similar variants found:', 
                similarVariants.map((v: any) => v.variantCode).join(', '));
            }
            
            qrData = { 
              variantCode: variantCode, 
              error: 'Variant ma\'lumotlar bazasida topilmadi',
              studentName: 'Topilmadi',
              testName: 'Topilmadi'
            };
          }
        } catch (apiError: any) {
          console.log('⚠️ Variant ma\'lumotlarini olishda xatolik:', apiError.message);
          qrData = { 
            variantCode: variantCode, 
            error: apiError.message,
            studentName: 'Xatolik',
            testName: 'Xatolik'
          };
        }
      } else {
        console.log('ℹ️ QR-kod topilmadi');
      }
    } catch (qrError: any) {
      console.log('⚠️ QR-kod skanerlashda xatolik (davom etamiz):', qrError.message);
    }

    console.log('🔍 2-bosqich: Javoblarni aniqlash...');

    // 2. Javoblarni aniqlash (omr_color.py - rangli blanklar uchun)
    const pythonScript = path.join(SERVER_ROOT, 'python', 'omr_color.py');
    
    // Python3 ni ishlatish (ko'p Linux serverlarida python3 bo'ladi)
    // Allow override via environment variable for production
    const pythonCmd = process.env.PYTHON_PATH || 
                     (process.platform === 'win32' ? 'python' : 'python3');
    
    // Передаём правильные ответы в Python, если они есть
    let command = `${pythonCmd} "${pythonScript}" "${imagePath}"`;
    
    // Prepare QR data JSON (with totalQuestions)
    let qrDataJson = '{}';
    if (qrFound && qrData && qrData.totalQuestions) {
      qrDataJson = JSON.stringify({ totalQuestions: qrData.totalQuestions }).replace(/"/g, '\\"');
    }
    
    if (qrFound && qrData && qrData.correctAnswers && Object.keys(qrData.correctAnswers).length > 0) {
      const correctAnswersJson = JSON.stringify(qrData.correctAnswers).replace(/"/g, '\\"');
      command = `${pythonCmd} "${pythonScript}" "${imagePath}" "${correctAnswersJson}" "${qrDataJson}"`;
      console.log('✅ Передаём правильные ответы в Python:', Object.keys(qrData.correctAnswers).length, 'вопросов');
      console.log('✅ Передаём QR data в Python: totalQuestions =', qrData.totalQuestions);
    } else {
      command = `${pythonCmd} "${pythonScript}" "${imagePath}" "{}" "${qrDataJson}"`;
      console.log('⚠️ Правильные ответы не найдены, Python будет только определять отмеченные ответы');
      if (qrData && qrData.totalQuestions) {
        console.log('✅ Передаём QR data в Python: totalQuestions =', qrData.totalQuestions);
      }
    }
    
    console.log('🐍 Python command:', command);
    console.log('📁 Python script path:', pythonScript);
    console.log('📸 Image path:', imagePath);
    console.log('🔧 Python executable:', pythonCmd);
    
    // Verify script exists
    try {
      await fs.access(pythonScript);
      console.log('✅ Python script exists');
    } catch (err) {
      console.error('❌ Python script not found at:', pythonScript);
      throw new Error(`Python script not found: ${pythonScript}`);
    }

    let result: any;
    try {
      const { stdout, stderr } = await execAsync(command, { 
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large output
        env: { ...process.env } // Pass environment variables
      });

      // Log stderr only if it contains errors (not DEBUG messages)
      if (stderr) {
        const stderrLines = stderr.split('\n');
        const errorLines = stderrLines.filter(line => 
          line.includes('ERROR') || line.includes('Traceback') || line.includes('Exception')
        );
        if (errorLines.length > 0) {
          console.error('Python errors:', errorLines.join('\n'));
        }
      }

      // Check if stdout is empty
      if (!stdout || stdout.trim().length === 0) {
        console.error('❌ Python script produced no output');
        console.error('❌ stderr:', stderr);
        throw new Error('Python script produced no output. Check if Python dependencies are installed.');
      }

      // Parse Python natijasi
      try {
        result = JSON.parse(stdout);
      } catch (parseError: any) {
        console.error('❌ Failed to parse Python output:', parseError.message);
        console.error('❌ stdout:', stdout);
        throw new Error(`Invalid JSON from Python script: ${parseError.message}`);
      }
    } catch (execError: any) {
      console.error('❌ Python execution error:', execError.message);
      console.error('❌ Error code:', execError.code);
      console.error('❌ stdout:', execError.stdout);
      console.error('❌ stderr:', execError.stderr);
      
      // Provide helpful error messages
      if (execError.code === 'ENOENT') {
        throw new Error(`Python executable not found: ${pythonCmd}. Install Python 3 or set PYTHON_PATH environment variable.`);
      }
      
      // Try to parse stdout even if there was an error
      if (execError.stdout && execError.stdout.trim().length > 0) {
        try {
          result = JSON.parse(execError.stdout);
          console.log('✅ Successfully parsed result from error output');
        } catch (parseError) {
          console.error('❌ Failed to parse Python output from error');
          throw new Error(`Python script failed: ${execError.message}. Check if dependencies (opencv-python, numpy) are installed.`);
        }
      } else {
        // Check if it's a dependency issue
        if (execError.stderr && (
          execError.stderr.includes('ModuleNotFoundError') ||
          execError.stderr.includes('ImportError') ||
          execError.stderr.includes('No module named')
        )) {
          throw new Error('Python dependencies missing. Run: pip3 install -r server/python/requirements.txt');
        }
        
        throw new Error(`Python script failed with no output. Error: ${execError.message}. Check server logs and verify Python installation.`);
      }
    }
    
    console.log('📊 Python natijasi (RAW):', JSON.stringify(result, null, 2));
    console.log('📊 detected_answers:', result.detected_answers);
    console.log('📊 detected_answers type:', typeof result.detected_answers);
    console.log('📊 detected_answers keys:', result.detected_answers ? Object.keys(result.detected_answers) : 'null');
    console.log('📊 detected_answers is Array:', Array.isArray(result.detected_answers));
    
    // ВАЖНО: Проверяем что detected_answers это объект, а не массив
    if (result.detected_answers && Array.isArray(result.detected_answers)) {
      console.error('❌ ОШИБКА: detected_answers это массив, а должен быть объект!');
      console.error('❌ Конвертируем массив в объект...');
      
      const answersObj: any = {};
      result.detected_answers.forEach((answer: string, index: number) => {
        if (answer) {
          answersObj[index + 1] = answer;
        }
      });
      result.detected_answers = answersObj;
      
      console.log('✅ Конвертировано:', result.detected_answers);
    }
    
    // Total questions ТОЛЬКО из варианта (QR-код)
    let totalQuestions = 0;
    let totalQuestionsSource = '';
    
    if (qrFound && qrData && qrData.correctAnswers && Object.keys(qrData.correctAnswers).length > 0) {
      // Количество вопросов ТОЛЬКО из варианта
      totalQuestions = Object.keys(qrData.correctAnswers).length;
      totalQuestionsSource = 'QR code variant';
      console.log('📊 Total questions (from variant):', totalQuestions);
      
      // ВАЖНО: Ограничиваем detected_answers только первыми totalQuestions
      // Python может найти лишние круги (шум, элементы дизайна)
      if (result.detected_answers) {
        const filteredAnswers: any = {};
        for (let i = 1; i <= totalQuestions; i++) {
          if (result.detected_answers[i]) {
            filteredAnswers[i] = result.detected_answers[i];
          }
        }
        console.log(`🔧 Filtered detected_answers: ${Object.keys(result.detected_answers).length} -> ${Object.keys(filteredAnswers).length}`);
        result.detected_answers = filteredAnswers;
      }
      
      // Также фильтруем invalid_answers
      if (result.invalid_answers) {
        const filteredInvalid: any = {};
        for (let i = 1; i <= totalQuestions; i++) {
          if (result.invalid_answers[i]) {
            filteredInvalid[i] = result.invalid_answers[i];
          }
        }
        if (Object.keys(result.invalid_answers).length !== Object.keys(filteredInvalid).length) {
          console.log(`🔧 Filtered invalid_answers: ${Object.keys(result.invalid_answers).length} -> ${Object.keys(filteredInvalid).length}`);
        }
        result.invalid_answers = filteredInvalid;
      }
    } else {
      // Если QR-код не найден - используем что нашел Python
      if (result.rows_found && result.rows_found > 0) {
        totalQuestions = result.rows_found;
        totalQuestionsSource = 'detected rows (no QR)';
      } else {
        const detectedQuestions = result.detected_answers ? Object.keys(result.detected_answers).map(Number) : [];
        totalQuestions = detectedQuestions.length > 0 ? Math.max(...detectedQuestions) : 0;
        totalQuestionsSource = 'detected answers (no QR)';
      }
      console.log('⚠️ QR-kod topilmadi, Python natijasidan foydalanilmoqda');
      console.log('📊 Total questions (fallback):', totalQuestions);
    }
    
    result.total_questions = totalQuestions;
    result.total_questions_source = totalQuestionsSource;
    console.log('📊 Final total questions:', result.total_questions, 'from', totalQuestionsSource);

    // QR-kod ma'lumotlarini qo'shish
    if (qrFound && qrData) {
      result.qr_found = true;
      result.qr_code = qrData;
      
      // Agar to'g'ri javoblar topilgan bo'lsa - solishtirish
      if (qrData.correctAnswers && result.detected_answers) {
        console.log('🔍 3-bosqich: Javoblarni solishtirish...');
        
        const detectedAnswers = result.detected_answers;
        const correctAnswers = qrData.correctAnswers;
        
        // ВАЖНО: Проверяем что correctAnswers не пустой
        if (Object.keys(correctAnswers).length === 0) {
          console.error('❌ correctAnswers пустой! Проверьте создание вариантов.');
          console.error('❌ qrData:', JSON.stringify(qrData, null, 2));
        }
        
        let correct = 0;
        let incorrect = 0;
        let unanswered = 0;
        const comparison: any[] = [];
        
        // Количество вопросов из варианта
        const totalQuestionsFromVariant = Object.keys(correctAnswers).length;
        
        console.log('🔍 Comparison details:', {
          totalQuestions: totalQuestionsFromVariant,
          first5CorrectAnswers: Object.keys(correctAnswers).slice(0, 5).map(key => 
            `${key}: ${correctAnswers[parseInt(key)]}`
          ).join(', '),
          first5DetectedAnswers: Object.keys(detectedAnswers).slice(0, 5).map(key => 
            `${key}: ${detectedAnswers[parseInt(key)]}`
          ).join(', '),
          correctAnswersCount: Object.keys(correctAnswers).length,
          detectedAnswersCount: Object.keys(detectedAnswers).length
        });
        
        // ВАЖНО: detectedAnswers[i] = ответ на ПОЗИЦИЮ i на бланке
        // correctAnswers[i] = правильный ответ для ВОПРОСА на позиции i в варианте
        // Эти позиции ВСЕГДА совпадают, потому что:
        // 1. На бланке вопросы идут по порядку: 1, 2, 3, ...
        // 2. В варианте shuffledQuestions тоже идут по порядку: [0], [1], [2], ...
        // 3. correctAnswers[i] берется из shuffledQuestions[i-1].correctAnswer
        // Поэтому прямое сравнение detectedAnswers[i] === correctAnswers[i] ПРАВИЛЬНО
        
        console.log('🔍 Детальное сравнение первых 10 вопросов:');
        
        // Проверяем каждый вопрос из варианта
        for (let i = 1; i <= totalQuestionsFromVariant; i++) {
          const studentAnswer = detectedAnswers[i] || null;
          const correctAnswer = correctAnswers[i];
          
          const isCorrect = studentAnswer === correctAnswer;
          
          if (i <= 10) {
            console.log(`  Q${i}: detected="${studentAnswer}" (type: ${typeof studentAnswer}), correct="${correctAnswer}" (type: ${typeof correctAnswer}), match=${isCorrect}`);
          }
          
          if (!studentAnswer) {
            unanswered++;
          } else if (isCorrect) {
            correct++;
          } else {
            incorrect++;
          }
          
          comparison.push({
            question: i,
            student_answer: studentAnswer,
            correct_answer: correctAnswer,
            is_correct: isCorrect
          });
        }
        
        const score = totalQuestionsFromVariant > 0 ? Math.round((correct / totalQuestionsFromVariant) * 100) : 0;
        
        result.comparison = {
          correct,
          incorrect,
          unanswered,
          total: totalQuestionsFromVariant,
          score,
          details: comparison
        };
        
        console.log('✅ Natija:', {
          correct,
          incorrect,
          unanswered,
          total: totalQuestionsFromVariant,
          score: `${score}%`
        });
      } else {
        console.log('⚠️ To\'g\'ri javoblar topilmadi, faqat aniqlangan javoblarni qaytaramiz');
        // Test topilmagan bo'lsa ham, aniqlangan javoblarni ko'rsatish
        const detectedAnswers = result.detected_answers || {};
        const invalidAnswers = result.invalid_answers || {};
        
        // Total questions: QR-koddan yoki scanner natijasidan
        const totalFromScanner = result.total_questions || 0;
        const detectedCount = Object.keys(detectedAnswers).length;
        const invalidCount = Object.keys(invalidAnswers).length;
        
        const details: any[] = [];
        
        // Barcha savollar bo'yicha details yaratish
        for (let i = 1; i <= totalFromScanner; i++) {
          if (detectedAnswers[i]) {
            // Aniqlangan javob
            details.push({
              question: i,
              student_answer: detectedAnswers[i],
              correct_answer: '?', // Test topilmagani uchun noma'lum
              is_correct: false // Test topilmagani uchun tekshirib bo'lmaydi
            });
          } else if (invalidAnswers[i]) {
            // Noto'g'ri (bir nechta javob)
            details.push({
              question: i,
              student_answer: invalidAnswers[i].join(', '),
              correct_answer: '?',
              is_correct: false,
              is_invalid: true,
              error: 'Multiple answers'
            });
          } else {
            // Javob berilmagan
            details.push({
              question: i,
              student_answer: null,
              correct_answer: '?',
              is_correct: false
            });
          }
        }
        
        result.comparison = {
          correct: 0,
          incorrect: 0,
          unanswered: totalFromScanner - detectedCount - invalidCount,
          total: totalFromScanner,
          score: 0,
          details: details,
          warning: 'Test ma\'lumotlari topilmadi, faqat aniqlangan javoblar ko\'rsatilmoqda'
        };
        
        console.log('📊 Comparison without QR:', {
          total: totalFromScanner,
          detected: detectedCount,
          invalid: invalidCount,
          unanswered: totalFromScanner - detectedCount - invalidCount
        });
      }
    } else {
      result.qr_found = false;
      console.log('ℹ️ QR-kod topilmadi, faqat aniqlangan javoblarni qaytaramiz');
      
      // QR-kod topilmagan bo'lsa ham, aniqlangan javoblarni ko'rsatish
      const detectedAnswers = result.detected_answers || {};
      const invalidAnswers = result.invalid_answers || {};
      
      // Total questions: scanner natijasidan
      const totalFromScanner = result.total_questions || 0;
      const detectedCount = Object.keys(detectedAnswers).length;
      const invalidCount = Object.keys(invalidAnswers).length;
      
      const details: any[] = [];
      
      // Barcha savollar bo'yicha details yaratish
      for (let i = 1; i <= totalFromScanner; i++) {
        if (detectedAnswers[i]) {
          // Aniqlangan javob
          details.push({
            question: i,
            student_answer: detectedAnswers[i],
            correct_answer: '?', // QR-kod topilmagani uchun noma'lum
            is_correct: false
          });
        } else if (invalidAnswers[i]) {
          // Noto'g'ri (bir nechta javob)
          details.push({
            question: i,
            student_answer: invalidAnswers[i].join(', '),
            correct_answer: '?',
            is_correct: false,
            is_invalid: true,
            error: 'Multiple answers'
          });
        } else {
          // Javob berilmagan
          details.push({
            question: i,
            student_answer: null,
            correct_answer: '?',
            is_correct: false
          });
        }
      }
      
      result.comparison = {
        correct: 0,
        incorrect: 0,
        unanswered: totalFromScanner - detectedCount - invalidCount,
        total: totalFromScanner,
        score: 0,
        details: details,
        warning: 'QR-kod topilmadi, faqat aniqlangan javoblar ko\'rsatilmoqda'
      };
      
      console.log('📊 Comparison without QR (no QR found):', {
        total: totalFromScanner,
        detected: detectedCount,
        invalid: invalidCount,
        unanswered: totalFromScanner - detectedCount - invalidCount
      });
    }

    console.log('✅ Tahlil tugadi');
    
    // Проверка что result существует
    if (!result || typeof result !== 'object') {
      console.error('❌ Result is invalid:', result);
      throw new Error('Invalid result from Python script');
    }
    
    // Добавляем пути к изображениям в ответ
    result.uploaded_image = req.file.filename;
    
    // Если есть обработанное изображение, добавляем полный путь для доступа через веб
    if (result.annotated_image) {
      result.annotated_image_url = `/uploads/omr/${result.annotated_image}`;
      console.log('📸 Annotated image URL:', result.annotated_image_url);
    }
    
    console.log('📤 Sending response to client...');
    console.log('📤 Response keys:', Object.keys(result));
    console.log('📤 Response success:', result.success);
    
    // Очищаем таймаут перед отправкой ответа
    clearTimeout(requestTimeout);
    
    res.json(result);
    
    console.log('✅ Response sent successfully');
    
  } catch (error: any) {
    // Очищаем таймаут при ошибке
    clearTimeout(requestTimeout);
    console.error('❌ Javoblarni aniqlashda xatolik:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      stderr: error.stderr,
      stdout: error.stdout
    });
    
    // VPS'da debug uchun qo'shimcha ma'lumotlar
    console.error('❌ Environment:', {
      NODE_ENV: process.env.NODE_ENV,
      platform: process.platform,
      __dirname: __dirname,
      cwd: process.cwd()
    });
    
    res.status(500).json({ 
      success: false,
      error: 'Javoblarni aniqlashda xatolik',
      details: error.message,
      stderr: error.stderr,
      stdout: error.stdout,
      // Production'da faqat muhim ma'lumotlarni yuborish
      debug: process.env.NODE_ENV !== 'production' ? {
        code: error.code,
        platform: process.platform,
        nodeVersion: process.version
      } : undefined
    });
  }
});

/**
 * POST /api/omr/save-result
 * Natijani o'quvchi profiliga saqlash
 */
router.post('/save-result', authenticate, async (req, res) => {
  try {
    const { 
      variantCode, 
      studentId, 
      testId, 
      detectedAnswers, 
      comparison,
      annotatedImage,
      originalImagePath
    } = req.body;

    console.log('📸 Rasm ma\'lumotlari:', {
      annotatedImage,
      originalImagePath,
      willSave: annotatedImage || originalImagePath
    });

    if (!variantCode || !studentId || !testId || !comparison) {
      return res.status(400).json({ error: 'Yetarli ma\'lumot yo\'q' });
    }

    const TestResult = require('../models/TestResult').default;
    const StudentVariant = require('../models/StudentVariant').default;
    
    // Variant ID ni topish
    const variant = await StudentVariant.findOne({ variantCode });
    if (!variant) {
      return res.status(404).json({ error: 'Variant topilmadi' });
    }

    // Javoblarni to'g'ri formatga o'tkazish
    const answers = comparison.details.map((detail: any) => {
      const questionNum = detail.question;
      const detectedAnswer = detectedAnswers[questionNum]; // Оригинальный ответ с фото
      const finalAnswer = detail.student_answer; // Финальный ответ (может быть отредактирован)
      const wasEdited = detectedAnswer !== finalAnswer; // Проверяем, был ли отредактирован
      
      return {
        questionIndex: detail.question - 1,
        selectedAnswer: finalAnswer || undefined,
        isCorrect: detail.is_correct,
        points: detail.is_correct ? 1 : 0,
        wasEdited: wasEdited,
        originalAnswer: detectedAnswer || undefined
      };
    });

    // Natijani saqlash - annotatedImage ni birinchi o'rinda ishlatish
    const imagePath = annotatedImage || originalImagePath;
    console.log('💾 Saqlanayotgan rasm yo\'li:', imagePath);
    
    const testResult = new TestResult({
      studentId,
      testId,
      variantId: variant._id,
      answers: answers,
      totalPoints: comparison.correct,
      maxPoints: comparison.total,
      percentage: comparison.score,
      scannedImagePath: imagePath,
      scannedAt: new Date()
    });

    await testResult.save();
    
    console.log('✅ Natija saqlandi, rasm yo\'li:', testResult.scannedImagePath);

    // Инвалидируем кэш статистики
    await Promise.all([
      invalidateCache('/api/statistics'),
      invalidateCache('/api/branches')
    ]);

    res.json({
      success: true,
      message: 'Natija saqlandi',
      result: testResult
    });

  } catch (error: any) {
    console.error('Natijani saqlashda xatolik:', error);
    res.status(500).json({ 
      error: 'Natijani saqlashda xatolik',
      details: error.message 
    });
  }
});

/**
 * GET /api/omr/results/:testId
 * Получение результатов сканирования для теста
 */
router.get('/results/:testId', authenticate, async (req, res) => {
  try {
    const { testId } = req.params;

    const TestResult = require('../models/TestResult').default;
    
    // Получаем все результаты для данного теста
    const results = await TestResult.find({ testId })
      .populate('studentId', 'fullName classNumber')
      .populate('variantId', 'variantCode')
      .sort({ scannedAt: -1 })
      .lean();
    
    // Форматируем результаты
    const formattedResults = results.map((result: any) => ({
      id: result._id,
      studentName: result.studentId?.fullName || 'Unknown',
      classNumber: result.studentId?.classNumber,
      variantCode: result.variantId?.variantCode,
      totalPoints: result.totalPoints,
      maxPoints: result.maxPoints,
      percentage: result.percentage,
      scannedAt: result.scannedAt,
      scannedImagePath: result.scannedImagePath,
      answersCount: result.answers?.length || 0
    }));
    
    res.json({
      success: true,
      count: formattedResults.length,
      results: formattedResults
    });
  } catch (error: any) {
    console.error('Ошибка получения результатов:', error);
    res.status(500).json({ 
      success: false,
      error: 'Ошибка при получении результатов',
      details: error.message 
    });
  }
});

/**
 * DELETE /api/omr/image/:filename
 * Rasmni o'chirish
 */
router.delete('/image/:filename', authenticate, async (req, res) => {
  try {
    const { filename } = req.params;
    const imagePath = path.join(SERVER_ROOT, 'uploads', 'omr', filename);
    
    await fs.unlink(imagePath);
    
    res.json({
      success: true,
      message: 'Rasm o\'chirildi'
    });
  } catch (error) {
    console.error('Rasmni o\'chirishda xatolik:', error);
    res.status(500).json({ error: 'Rasmni o\'chirishda xatolik' });
  }
});

export default router;
