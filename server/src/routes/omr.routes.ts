import express from 'express';
import multer from 'multer';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { authenticate } from '../middleware/auth';

const router = express.Router();
const execAsync = promisify(exec);

// Настройка multer для загрузки изображений
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/omr/');
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
      const isDev = process.env.NODE_ENV !== 'production';
      const qrScriptPath = isDev
        ? path.join(__dirname, '../../python/qr_scanner.py')
        : path.join(__dirname, '../../../python/qr_scanner.py');
      
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const qrCommand = `${pythonCmd} "${qrScriptPath}" "${imagePath}"`;
      
      console.log('🔍 QR scanner command:', qrCommand);
      const { stdout: qrOutput } = await execAsync(qrCommand, { timeout: 10000 });
      
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
          
          variantInfo = await StudentVariant.findOne({ variantCode: variantCode })
            .populate('studentId');
          
          console.log('📊 Variant topildi:', variantInfo ? 'Ha' : 'Yo\'q');
          
          if (variantInfo) {
            console.log('📝 Variant ma\'lumotlari:', {
              variantCode: variantInfo.variantCode,
              studentId: variantInfo.studentId?._id,
              testId: variantInfo.testId,
              testType: variantInfo.testType
            });
            
            // Test yoki BlockTest ekanligini aniqlash
            let correctAnswers: any = {};
            let testData: any = null;
            const testId = variantInfo.testId;
            
            console.log('🔍 Test qidirilmoqda:', testId);
            console.log('🔍 Test turi:', variantInfo.testType);
            
            // testType ga qarab to'g'ri modeldan yuklash
            if (variantInfo.testType === 'BlockTest') {
              console.log('🔍 Blok test qidirilmoqda...');
              const blockTest = await BlockTest.findById(testId);
              
              if (blockTest) {
                console.log('✅ Blok test topildi:', blockTest.name);
                testData = blockTest;
                
                // Для блок-теста нужно получить конфигурацию студента
                const StudentTestConfig = require('../models/StudentTestConfig').default;
                const studentConfig = await StudentTestConfig.findOne({ 
                  studentId: variantInfo.studentId?._id || variantInfo.studentId 
                }).populate('subjects.subjectId');
                
                console.log('📋 Student config topildi:', studentConfig ? 'Ha' : 'Yo\'q');
                
                if (studentConfig) {
                  // Blok testda student config bo'yicha to'g'ri javoblarni yig'ish
                  // Используем shuffledQuestions если они есть
                  if (variantInfo.shuffledQuestions && variantInfo.shuffledQuestions.length > 0) {
                    console.log('✅ Используем перемешанные вопросы из варианта');
                    console.log('📦 Shuffled questions count:', variantInfo.shuffledQuestions.length);
                    console.log('📦 First 5 shuffled answers:', 
                      variantInfo.shuffledQuestions.slice(0, 5).map((q: any, i: number) => 
                        `${i + 1}: ${q.correctAnswer}`
                      ).join(', ')
                    );
                    
                    variantInfo.shuffledQuestions.forEach((question: any, index: number) => {
                      correctAnswers[index + 1] = question.correctAnswer;
                    });
                    console.log(`✅ Jami ${Object.keys(correctAnswers).length} ta to'g'ri javob (shuffled)`);
                    console.log('📦 Final first 5 correct answers:', 
                      Object.keys(correctAnswers).slice(0, 5).map(key => 
                        `${key}: ${correctAnswers[parseInt(key)]}`
                      ).join(', ')
                    );
                  } else {
                    // Fallback к оригинальным вопросам
                    console.log('⚠️ Shuffled questions topilmadi, original ishlatilmoqda');
                    let questionNum = 1;
                    
                    for (const subjectConfig of studentConfig.subjects) {
                      const subjectId = subjectConfig.subjectId._id || subjectConfig.subjectId;
                      const subjectTest = blockTest.subjectTests.find(
                        (st: any) => (st.subjectId._id || st.subjectId).toString() === subjectId.toString()
                      );
                      
                      if (subjectTest && subjectTest.questions) {
                        const questionsToTake = Math.min(
                          subjectConfig.questionCount,
                          subjectTest.questions.length
                        );
                        
                        console.log(`  📝 Fan: ${subjectConfig.subjectId.nameUzb}, Savollar: ${questionsToTake}`);
                        
                        for (let i = 0; i < questionsToTake; i++) {
                          const question = subjectTest.questions[i];
                          correctAnswers[questionNum] = question.correctAnswer;
                          questionNum++;
                        }
                      }
                    }
                    
                    console.log(`✅ Jami ${Object.keys(correctAnswers).length} ta to'g'ri javob yig'ildi`);
                  }
                } else {
                  // Agar config topilmasa, barcha savollarni olish
                  console.log('⚠️ Student config topilmadi, barcha savollarni olish');
                  let questionNum = 1;
                  for (const subjectTest of blockTest.subjectTests) {
                    if (subjectTest.questions) {
                      for (const question of subjectTest.questions) {
                        correctAnswers[questionNum] = question.correctAnswer;
                        questionNum++;
                      }
                    }
                  }
                }
              } else {
                console.log('❌ Blok test topilmadi');
              }
            } else {
              // Oddiy test
              console.log('🔍 Oddiy test qidirilmoqda...');
              const test = await Test.findById(testId);
              
              if (test) {
                console.log('✅ Oddiy test topildi:', test.name);
                testData = test;
                
                // Используем shuffledQuestions если они есть
                if (variantInfo.shuffledQuestions && variantInfo.shuffledQuestions.length > 0) {
                  console.log('✅ Используем перемешанные вопросы из варианта');
                  variantInfo.shuffledQuestions.forEach((question: any, index: number) => {
                    correctAnswers[index + 1] = question.correctAnswer;
                  });
                  console.log(`✅ Jami ${Object.keys(correctAnswers).length} ta to'g'ri javob (shuffled)`);
                } else {
                  // Fallback к оригинальным вопросам
                  console.log('⚠️ Shuffled questions topilmadi, original ishlatilmoqda');
                  test.questions.forEach((q: any, index: number) => {
                    correctAnswers[index + 1] = q.correctAnswer;
                  });
                }
              } else {
                console.log('❌ Oddiy test topilmadi');
              }
            }
            
            const studentName = variantInfo.studentId?.fullName || 
                              `${variantInfo.studentId?.firstName || ''} ${variantInfo.studentId?.lastName || ''}`.trim() ||
                              'Noma\'lum';
            
            // Для блок-теста показываем дату, для обычного теста - название
            let testName = testData?.name || 'Test topilmadi';
            if (variantInfo.testType === 'BlockTest' && testData) {
              // Форматируем дату блок-теста
              const testDate = new Date(testData.date);
              const formattedDate = testDate.toLocaleDateString('uz-UZ', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
              });
              testName = `Blok Test - ${formattedDate}`;
            }
            
            qrData = {
              variantCode: variantCode,
              testId: testId,
              studentId: variantInfo.studentId?._id || variantInfo.studentId,
              studentName: studentName,
              testName: testName,
              correctAnswers: correctAnswers,
              questionOrder: variantInfo.questionOrder
            };
            console.log('✅ To\'liq ma\'lumotlar olindi:', {
              variantCode,
              studentName: qrData.studentName,
              testName: qrData.testName,
              totalQuestions: Object.keys(correctAnswers).length,
              first10Answers: Object.keys(correctAnswers).slice(0, 10).map(key => 
                `${key}: ${correctAnswers[parseInt(key)]}`
              ).join(', ')
            });
          } else {
            console.log('⚠️ Variant topilmadi:', variantCode);
            
            // Show all variants (for debugging)
            const allVariants = await StudentVariant.find().limit(5);
            console.log('Available variants (first 5):', 
              allVariants.map((v: any) => v.variantCode).join(', '));
            
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
    // Production'da __dirname dist papkasida bo'ladi, shuning uchun to'g'ri yo'lni topish kerak
    const isDev = process.env.NODE_ENV !== 'production';
    const pythonScript = isDev 
      ? path.join(__dirname, '../../python/omr_color.py')
      : path.join(__dirname, '../../../python/omr_color.py');
    
    // Python3 ni ishlatish (ko'p Linux serverlarida python3 bo'ladi)
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const command = `${pythonCmd} "${pythonScript}" "${imagePath}"`;
    
    console.log('🐍 Python command:', command);
    console.log('📁 Python script path:', pythonScript);
    console.log('📸 Image path:', imagePath);

    let result: any;
    try {
      const { stdout, stderr } = await execAsync(command, { 
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large output
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

      // Parse Python natijasi
      result = JSON.parse(stdout);
    } catch (execError: any) {
      console.error('❌ Python execution error:', execError.message);
      
      // Try to parse stdout even if there was an error
      if (execError.stdout) {
        try {
          result = JSON.parse(execError.stdout);
          console.log('✅ Successfully parsed result from error output');
        } catch (parseError) {
          console.error('❌ Failed to parse Python output');
          throw new Error('Python script failed to execute properly');
        }
      } else {
        throw new Error('Python script failed with no output');
      }
    }
    
    console.log('📊 Python natijasi (RAW):', JSON.stringify(result, null, 2));
    console.log('📊 detected_answers:', result.detected_answers);
    console.log('📊 detected_answers type:', typeof result.detected_answers);
    console.log('📊 detected_answers keys:', result.detected_answers ? Object.keys(result.detected_answers) : 'null');
    
    // Total questions ni to'g'ri aniqlash
    // PRIORITET:
    // 1. QR-koddan (eng ishonchli)
    // 2. Python scanner natijasi (rows_found)
    // 3. Aniqlangan javoblarning eng katta raqami
    let totalQuestions = 0;
    let totalQuestionsSource = '';
    
    if (qrFound && qrData && qrData.correctAnswers) {
      // QR-koddan to'g'ri javoblar soni - ENG ISHONCHLI
      totalQuestions = Object.keys(qrData.correctAnswers).length;
      totalQuestionsSource = 'QR code';
      console.log('📊 Total questions (from QR correctAnswers):', totalQuestions);
    } else if (result.rows_found && result.rows_found > 0) {
      // Python scanner topgan qatorlar soni
      totalQuestions = result.rows_found;
      totalQuestionsSource = 'detected rows';
      console.log('📊 Total questions (from scanner rows_found):', totalQuestions);
    } else {
      // Aniqlangan javoblarning eng katta raqami (fallback)
      const detectedQuestions = result.detected_answers ? Object.keys(result.detected_answers).map(Number) : [];
      totalQuestions = detectedQuestions.length > 0 ? Math.max(...detectedQuestions) : 0;
      totalQuestionsSource = 'detected answers';
      console.log('📊 Total questions (from detected answers max):', totalQuestions);
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
        const questionOrder = qrData.questionOrder || [];
        
        let correct = 0;
        let incorrect = 0;
        let unanswered = 0;
        const comparison: any[] = [];
        
        // Barcha savollar bo'yicha tekshirish
        const totalQuestions = Object.keys(correctAnswers).length;
        
        console.log('🔍 Comparison details:', {
          totalQuestions,
          hasQuestionOrder: questionOrder.length > 0,
          questionOrderLength: questionOrder.length,
          first5CorrectAnswers: Object.keys(correctAnswers).slice(0, 5).map(key => 
            `${key}: ${correctAnswers[parseInt(key)]}`
          ).join(', ')
        });
        
        for (let i = 1; i <= totalQuestions; i++) {
          const studentAnswer = detectedAnswers[i] || null;
          const correctAnswer = correctAnswers[i];
          
          // НЕ используем questionOrder, потому что shuffledQuestions уже содержат
          // правильные ответы в правильном порядке!
          // questionOrder используется только для перемешивания порядка ВОПРОСОВ на листе,
          // но не для изменения правильных ответов
          const actualCorrectAnswer = correctAnswer;
          
          const isCorrect = studentAnswer === actualCorrectAnswer;
          
          if (i <= 5) {
            console.log(`  Q${i}: student=${studentAnswer}, correct=${actualCorrectAnswer}, isCorrect=${isCorrect}`);
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
            correct_answer: actualCorrectAnswer,
            is_correct: isCorrect
          });
        }
        
        const score = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;
        
        result.comparison = {
          correct,
          incorrect,
          unanswered,
          total: totalQuestions,
          score,
          details: comparison
        };
        
        console.log('✅ Natija:', {
          correct,
          incorrect,
          unanswered,
          total: totalQuestions,
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
    
    // Добавляем путь к изображению в ответ
    result.uploaded_image = req.file.filename;
    
    console.log('📤 Sending response to client...');
    console.log('📤 Response keys:', Object.keys(result));
    console.log('📤 Response success:', result.success);
    
    res.json(result);
    
    console.log('✅ Response sent successfully');
    
  } catch (error: any) {
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
    const answers = comparison.details.map((detail: any) => ({
      questionIndex: detail.question - 1,
      selectedAnswer: detail.student_answer || undefined,
      isCorrect: detail.is_correct,
      points: detail.is_correct ? 1 : 0
    }));

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
 * GET /api/omr/results/:assignmentId
 * Получение результатов сканирования для задания
 */
router.get('/results/:assignmentId', authenticate, async (req, res) => {
  try {
    const { assignmentId } = req.params;

    // TODO: Получить результаты из базы данных
    
    res.json({
      success: true,
      results: []
    });
  } catch (error) {
    console.error('Ошибка получения результатов:', error);
    res.status(500).json({ error: 'Ошибка при получении результатов' });
  }
});

/**
 * DELETE /api/omr/image/:filename
 * Rasmni o'chirish
 */
router.delete('/image/:filename', authenticate, async (req, res) => {
  try {
    const { filename } = req.params;
    const imagePath = path.join(__dirname, '../../uploads/omr/', filename);
    
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
