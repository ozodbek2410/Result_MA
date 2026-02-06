import express from 'express';
import BlockTest from '../models/BlockTest';
import Student from '../models/Student';
import StudentVariant from '../models/StudentVariant';
import StudentTestConfig from '../models/StudentTestConfig';
import { authenticate, AuthRequest } from '../middleware/auth';
import { cacheMiddleware, invalidateCache } from '../middleware/cache';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Import block test from file
router.post('/import/confirm', authenticate, async (req: AuthRequest, res) => {
  try {
    const { questions, classNumber, subjectId, periodMonth, periodYear } = req.body;

    if (!questions || questions.length === 0) {
      return res.status(400).json({ message: 'Savollar topilmadi' });
    }

    if (!classNumber) {
      return res.status(400).json({ message: 'Sinf tanlanmagan' });
    }

    if (!subjectId) {
      return res.status(400).json({ message: 'Fan tanlanmagan' });
    }

    if (!periodMonth || !periodYear) {
      return res.status(400).json({ message: 'Davr tanlanmagan' });
    }

    // Ищем существующий блок-тест для этого класса и периода
    let blockTest = await BlockTest.findOne({
      branchId: req.user?.branchId,
      classNumber,
      periodMonth,
      periodYear
    });

    if (blockTest) {
      // ВСЕГДА добавляем новый тест как отдельный предмет
      // Не проверяем дубликаты - каждый импорт создает новую запись
      blockTest.subjectTests.push({
        subjectId,
        questions
      });
      console.log(`Added new test for subject ${subjectId} to existing block test ${blockTest._id}`);
      console.log(`Total tests in block: ${blockTest.subjectTests.length}`);

      await blockTest.save();
      
      // Инвалидируем кэш блок-тестов
      await invalidateCache('/api/block-tests');
    } else {
      // Создаем новый блок-тест
      blockTest = new BlockTest({
        branchId: req.user?.branchId,
        classNumber,
        date: new Date(),
        periodMonth,
        periodYear,
        subjectTests: [{
          subjectId,
          questions
        }],
        studentConfigs: [],
        createdBy: req.user?.id
      });

      await blockTest.save();
      console.log('Created new block test:', blockTest._id);
      
      // Инвалидируем кэш блок-тестов
      await invalidateCache('/api/block-tests');
    }

    res.status(201).json({ 
      message: 'Blok test muvaffaqiyatli saqlandi',
      blockTest
    });
  } catch (error: any) {
    console.error('Error saving imported block test:', error);
    res.status(500).json({ message: 'Saqlashda xatolik', error: error.message });
  }
});

router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { classNumber, periodMonth, periodYear, subjectTests } = req.body;

    if (!classNumber) {
      return res.status(400).json({ message: 'Sinf tanlanmagan' });
    }

    if (!periodMonth || !periodYear) {
      return res.status(400).json({ message: 'Davr tanlanmagan' });
    }

    if (!subjectTests || subjectTests.length === 0) {
      return res.status(400).json({ message: 'Kamida bitta fan qo\'shing' });
    }

    // Создаем новый блок-тест (без автоматического слияния)
    const blockTest = new BlockTest({
      branchId: req.user?.branchId,
      classNumber,
      date: new Date(),
      periodMonth,
      periodYear,
      subjectTests,
      studentConfigs: [],
      createdBy: req.user?.id
    });

    await blockTest.save();
    console.log('Created new block test:', blockTest._id);

    // Инвалидируем кэш блок-тестов
    await invalidateCache('/api/block-tests');

    res.status(201).json({ 
      message: 'Blok test muvaffaqiyatli yaratildi',
      blockTest
    });
  } catch (error: any) {
    console.error('Error creating block test:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.get('/', authenticate, cacheMiddleware(180), async (req: AuthRequest, res) => {
  try {
    const blockTests = await BlockTest.find({ branchId: req.user?.branchId })
      .populate('subjectTests.subjectId', 'nameUzb nameRu')
      .select('classNumber date periodMonth periodYear subjectTests studentConfigs createdAt')
      .sort({ date: -1 })
      .lean()
      .exec();
    
    console.log(`Found ${blockTests.length} block tests`);
    
    const testsWithCounts = blockTests.map(test => ({
      ...test,
      studentCount: test.studentConfigs?.length || 0
    }));
    
    res.json(testsWithCounts);
  } catch (error) {
    console.error('Error fetching block tests:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

router.get('/:id', authenticate, cacheMiddleware(300), async (req: AuthRequest, res) => {
  try {
    console.log(`Fetching block test by ID: ${req.params.id}`);
    
    const blockTest = await BlockTest.findById(req.params.id)
      .populate('subjectTests.subjectId', 'nameUzb nameRu')
      .lean()
      .exec();
    
    if (!blockTest) {
      console.log('Block test not found');
      return res.status(404).json({ message: 'Blok test topilmadi' });
    }
    
    console.log(`Found block test: Class ${blockTest.classNumber}, ${blockTest.subjectTests.length} subjects`);
    
    res.json(blockTest);
  } catch (error) {
    console.error('Error fetching block test:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// Update block test
router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { classNumber, periodMonth, periodYear, subjectTests } = req.body;
    
    const blockTest = await BlockTest.findById(req.params.id);
    
    if (!blockTest) {
      return res.status(404).json({ message: 'Blok test topilmadi' });
    }
    
    // Check if user has permission to edit
    if (blockTest.branchId.toString() !== req.user?.branchId?.toString()) {
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }
    
    // Update fields
    if (classNumber) blockTest.classNumber = classNumber;
    if (periodMonth) blockTest.periodMonth = periodMonth;
    if (periodYear) blockTest.periodYear = periodYear;
    if (subjectTests) blockTest.subjectTests = subjectTests;
    
    await blockTest.save();
    
    console.log(`Updated block test ${blockTest._id}`);
    if (subjectTests) {
      console.log(`Updated ${subjectTests.length} subjects`);
    }
    
    // Инвалидируем кэш блок-тестов
    await invalidateCache('/api/block-tests');
    
    res.json({ message: 'Blok test yangilandi', blockTest });
  } catch (error) {
    console.error('Error updating block test:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// Delete block test
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const blockTest = await BlockTest.findById(req.params.id);
    
    if (!blockTest) {
      return res.status(404).json({ message: 'Blok test topilmadi' });
    }
    
    // Check if user has permission to delete
    if (blockTest.branchId.toString() !== req.user?.branchId?.toString()) {
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }
    
    await BlockTest.findByIdAndDelete(req.params.id);
    
    // Инвалидируем кэш блок-тестов
    await invalidateCache('/api/block-tests');
    
    res.json({ message: 'Blok test o\'chirildi' });
  } catch (error) {
    console.error('Error deleting block test:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// Merge duplicate block tests (admin utility)
router.post('/merge-duplicates', authenticate, async (req: AuthRequest, res) => {
  try {
    // Get all block tests for this branch
    const allBlockTests = await BlockTest.find({ branchId: req.user?.branchId })
      .populate('subjectTests.subjectId');

    // Group by classNumber, periodMonth, periodYear
    const groups = new Map<string, any[]>();

    for (const bt of allBlockTests) {
      const key = `${bt.classNumber}_${bt.periodMonth}_${bt.periodYear}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(bt);
    }

    let mergedCount = 0;
    let deletedCount = 0;

    // Process each group
    for (const [key, blockTests] of groups.entries()) {
      if (blockTests.length <= 1) continue;

      // Use first block test as main
      const mainBlockTest = blockTests[0];
      const subjectsToMerge: any[] = [];

      // Collect subjects from other block tests
      for (let i = 1; i < blockTests.length; i++) {
        const bt = blockTests[i];
        
        for (const st of bt.subjectTests) {
          // Check if subject already exists in main block test
          const existingSubject = mainBlockTest.subjectTests.find(
            (s: any) => s.subjectId.toString() === st.subjectId.toString()
          );

          if (!existingSubject) {
            subjectsToMerge.push({
              subjectId: st.subjectId,
              questions: st.questions
            });
          }
        }
      }

      // Add subjects to main block test
      if (subjectsToMerge.length > 0) {
        mainBlockTest.subjectTests.push(...subjectsToMerge);
        await mainBlockTest.save();
        mergedCount++;
      }

      // Delete other block tests
      for (let i = 1; i < blockTests.length; i++) {
        await BlockTest.findByIdAndDelete(blockTests[i]._id);
        deletedCount++;
      }
    }

    res.json({
      message: 'Dublikatlar birlashtirildi',
      mergedGroups: mergedCount,
      deletedBlockTests: deletedCount
    });
  } catch (error) {
    console.error('Error merging block tests:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// Generate variants for block test students
router.post('/:id/generate-variants', authenticate, async (req: AuthRequest, res) => {
  try {
    const { studentIds } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: 'O\'quvchilar ro\'yxati bo\'sh' });
    }

    const blockTest = await BlockTest.findById(req.params.id);
    if (!blockTest) {
      return res.status(404).json({ message: 'Blok test topilmadi' });
    }

    // Calculate total questions in block test
    let totalQuestions = 0;
    for (const subjectTest of blockTest.subjectTests) {
      totalQuestions += subjectTest.questions.length;
    }

    // Delete existing variants for these students
    await StudentVariant.deleteMany({ 
      testId: blockTest._id,
      studentId: { $in: studentIds }
    });

    // Helper function to shuffle array
    const shuffleArray = (array: any[]) => {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    // Helper function to shuffle answer variants (A, B, C, D)
    const shuffleVariants = (question: any) => {
      if (!question.variants || question.variants.length === 0) {
        console.log('⚠️ Question has no variants:', question.text?.substring(0, 50));
        return question; // No variants to shuffle
      }

      // Create a copy of the question
      const shuffledQuestion = { ...question };
      
      // Find the original correct answer text
      const originalCorrectVariant = question.variants.find(
        (v: any) => v.letter === question.correctAnswer
      );
      
      if (!originalCorrectVariant) {
        console.log('⚠️ Could not find correct answer:', question.correctAnswer);
        return question; // Can't shuffle if we don't know the correct answer
      }
      
      // Shuffle the variants array
      const shuffledVariants = shuffleArray([...question.variants]);
      
      // Find where the correct answer ended up after shuffling
      const newIndex = shuffledVariants.findIndex(
        (v: any) => v.text === originalCorrectVariant.text
      );
      
      if (newIndex !== -1) {
        // Assign new letters A, B, C, D based on new positions
        const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
        const reorderedVariants = shuffledVariants.map((v: any, idx: number) => ({
          ...v,
          letter: letters[idx]
        }));
        
        // Update the correct answer to the new letter
        shuffledQuestion.correctAnswer = letters[newIndex];
        shuffledQuestion.variants = reorderedVariants;
        
        // Log if answer changed
        if (question.correctAnswer !== shuffledQuestion.correctAnswer) {
          console.log(`✅ Shuffled: ${question.correctAnswer} → ${shuffledQuestion.correctAnswer}`);
        }
      }
      
      return shuffledQuestion;
    };

    // Batch processing для больших групп студентов (100+)
    const BATCH_SIZE = 50;
    const variants = [];
    
    console.log(`📊 Processing ${studentIds.length} students in batches of ${BATCH_SIZE}`);
    
    for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
      const batchStudentIds = studentIds.slice(i, i + BATCH_SIZE);
      console.log(`📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(studentIds.length / BATCH_SIZE)}`);
      
      const batchVariants = [];
      
      for (const studentId of batchStudentIds) {
      const variantCode = uuidv4().substring(0, 8).toUpperCase();
      
      // ВАЖНО: Получаем конфигурацию студента (какие предметы он выбрал)
      const studentConfig = await StudentTestConfig.findOne({ studentId })
        .populate('subjects.subjectId');
      
      if (!studentConfig) {
        console.log(`⚠️ Student ${studentId}: No config found, skipping`);
        continue; // Пропускаем студента без конфигурации
      }
      
      console.log(`📋 Student ${studentId}: Config found with ${studentConfig.subjects.length} subjects`);
      
      // Shuffle questions WITHIN each subject (not across subjects)
      // ТОЛЬКО для предметов, которые выбрал студент!
      const shuffledQuestions: any[] = [];
      
      for (const subjectConfig of studentConfig.subjects) {
        const subjectId = (subjectConfig.subjectId._id || subjectConfig.subjectId).toString();
        const questionCount = subjectConfig.questionCount;
        
        // Находим этот предмет в блок-тесте
        const subjectTest = blockTest.subjectTests.find(
          (st: any) => (st.subjectId._id || st.subjectId).toString() === subjectId
        );
        
        if (!subjectTest || !subjectTest.questions || subjectTest.questions.length === 0) {
          console.log(`⚠️ Subject ${subjectId}: No questions found in block test`);
          continue;
        }
        
        // Берем только нужное количество вопросов
        const questionsToTake = Math.min(questionCount, subjectTest.questions.length);
        
        console.log(`📝 Subject ${(subjectConfig.subjectId as any).nameUzb}: Taking ${questionsToTake} questions`);
        
        // Shuffle questions within this subject
        const subjectQuestions = shuffleArray([...subjectTest.questions]).slice(0, questionsToTake);
        
        // Shuffle answer variants for each question
        for (const question of subjectQuestions) {
          const shuffled = shuffleVariants(question);
          // Сохраняем subjectId для каждого вопроса
          shuffled.subjectId = subjectTest.subjectId;
          shuffledQuestions.push(shuffled);
        }
      }
      
      console.log(`📊 Student ${studentId}: Total shuffled questions: ${shuffledQuestions.length}`);
      
      // Log first 3 questions to verify shuffling
      if (shuffledQuestions.length > 0) {
        console.log('🔀 First 3 shuffled questions:', shuffledQuestions.slice(0, 3).map((q, i) => ({
          index: i,
          text: q.text?.substring(0, 50),
          shuffledAnswer: q.correctAnswer,
          hasVariants: !!q.variants
        })));
      }
      
      // Simple QR payload - just variant code (easy to scan)
      // Full data can be retrieved via API using this code
      const qrPayload = variantCode;

      const variant = new StudentVariant({
        testId: blockTest._id,
        testType: 'BlockTest',
        studentId,
        variantCode,
        qrPayload,
        shuffledQuestions // Store shuffled questions with shuffled variants
      });

        batchVariants.push(variant);
      }
      
      // Сохраняем batch одним запросом
      if (batchVariants.length > 0) {
        await StudentVariant.insertMany(batchVariants);
        variants.push(...batchVariants);
        console.log(`✅ Saved batch: ${batchVariants.length} variants`);
      }
    }

    console.log(`✅ Generated ${variants.length} variants with shuffled questions (within each subject)`);

    res.json({ 
      message: 'Variantlar yaratildi', 
      count: variants.length, 
      variants 
    });
  } catch (error) {
    console.error('Error generating block test variants:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

export default router;
