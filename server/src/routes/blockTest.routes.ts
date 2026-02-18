import express from 'express';
import BlockTest from '../models/BlockTest';
import Student from '../models/Student';
import StudentGroup from '../models/StudentGroup';
import StudentVariant from '../models/StudentVariant';
import StudentTestConfig from '../models/StudentTestConfig';
import { authenticate, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { PDFExportService } from '../services/pdfExportService';
import { PDFGeneratorService } from '../services/pdfGeneratorService';
import { PandocDocxService } from '../services/pandocDocxService';
import { convertTiptapJsonToText } from '../utils/textUtils';
import wordExportQueue from '../services/queue/wordExportQueue';
import { S3Service } from '../services/s3Service';

const router = express.Router();

// Import block test from file
router.post('/import/confirm', authenticate, async (req: AuthRequest, res) => {
  try {
    console.log('📥 Import request body:', JSON.stringify(req.body, null, 2));
    
    const { questions, classNumber, subjectId, groupLetter, periodMonth, periodYear } = req.body;

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

    console.log('✅ Validation passed, creating/updating block test...');
    console.log('📝 Period:', periodMonth, '/', periodYear, 'Types:', typeof periodMonth, typeof periodYear);
    console.log('📝 Class:', classNumber, 'Type:', typeof classNumber);
    console.log('📝 Subject:', subjectId);
    console.log('📝 groupLetter:', groupLetter);
    console.log('📝 BranchId:', req.user?.branchId);

    // Преобразуем в числа для корректного поиска
    const periodMonthNum = parseInt(periodMonth as any);
    const periodYearNum = parseInt(periodYear as any);
    const classNumberNum = parseInt(classNumber as any);
    
    console.log('📝 Converted values:', {
      periodMonth: periodMonthNum,
      periodYear: periodYearNum,
      classNumber: classNumberNum
    });

    // Ищем существующий блок-тест для этого класса и периода (месяц+год)
    const searchQuery = {
      branchId: req.user?.branchId,
      classNumber: classNumberNum,
      periodMonth: periodMonthNum,
      periodYear: periodYearNum
    };
    
    console.log('🔍 Searching for existing block test with query:', JSON.stringify(searchQuery));
    
    let blockTest = await BlockTest.findOne(searchQuery);
    
    console.log('🔍 Search result:', blockTest ? `Found: ${blockTest._id}` : 'Not found - will create new');

    if (blockTest) {
      console.log('📦 Found existing block test:', blockTest._id);
      console.log('📦 Block test period:', blockTest.periodMonth, '/', blockTest.periodYear);
      console.log('📦 Block test class:', blockTest.classNumber);
      console.log('📦 Existing subjects:', blockTest.subjectTests.length);
      
      // Проверяем, нет ли уже ТОЧНО такого же предмета с такой же буквой
      const existingSubjectIndex = blockTest.subjectTests.findIndex((st: any) => {
        const sameSubject = st.subjectId.toString() === subjectId;
        const sameLetter = st.groupLetter === (groupLetter || null);
        return sameSubject && sameLetter;
      });
      
      if (existingSubjectIndex !== -1) {
        console.log('⚠️ Exact same subject with same letter already exists, REPLACING questions...');
        // Заменяем ТОЛЬКО вопросы, не весь предмет
        blockTest.subjectTests[existingSubjectIndex].questions = questions as any;
        blockTest.markModified('subjectTests');
      } else {
        console.log('✅ Adding new subject/letter combination to existing block test');
        blockTest.subjectTests.push({
          subjectId: subjectId as any,
          groupLetter: groupLetter || null,
          questions: questions as any
        } as any);
      }
      
      await blockTest.save();
      console.log('✅ Block test updated, total subjects:', blockTest.subjectTests.length);
    } else {
      console.log('🆕 Creating new block test...');
      console.log('🆕 Parameters:', {
        branchId: req.user?.branchId,
        classNumber: classNumberNum,
        periodMonth: periodMonthNum,
        periodYear: periodYearNum,
        subjectId,
        groupLetter: groupLetter || null
      });
      
      // Создаем новый блок-тест
      blockTest = new BlockTest({
        branchId: req.user?.branchId,
        classNumber: classNumberNum,
        date: new Date(),
        periodMonth: periodMonthNum,
        periodYear: periodYearNum,
        subjectTests: [{
          subjectId: subjectId as any,
          groupLetter: groupLetter || null,
          questions: questions as any
        }] as any,
        studentConfigs: [],
        createdBy: req.user?.id
      });

      await blockTest.save();
      console.log('✅ New block test created:', blockTest._id);
      console.log('✅ Block test details:', {
        id: blockTest._id,
        class: blockTest.classNumber,
        period: `${blockTest.periodMonth}/${blockTest.periodYear}`,
        subjects: blockTest.subjectTests.length
      });
    }

    res.status(201).json({ 
      message: 'Blok test muvaffaqiyatli saqlandi',
      blockTest: {
        _id: blockTest._id,
        classNumber: blockTest.classNumber,
        periodMonth: blockTest.periodMonth,
        periodYear: blockTest.periodYear,
        subjectTests: blockTest.subjectTests.length,
        date: blockTest.date
      }
    });
  } catch (error: any) {
    console.error('❌ Error saving imported block test:', error);
    console.error('❌ Error stack:', error.stack);
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

    res.status(201).json({ 
      message: 'Blok test muvaffaqiyatli yaratildi',
      blockTest
    });
  } catch (error: any) {
    console.error('Error creating block test:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const fields = req.query.fields as string;
    const classNumber = req.query.classNumber as string;
    const date = req.query.date as string;
    
    // Базовый фильтр по филиалу
    const filter: any = { branchId: req.user?.branchId };
    
    // Добавляем фильтр по классу если указан
    if (classNumber) {
      filter.classNumber = parseInt(classNumber);
    }
    
    // Добавляем фильтр по дате если указана
    if (date) {
      // Фильтруем по дате (начало и конец дня)
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      filter.date = {
        $gte: startDate,
        $lte: endDate
      };
    }
    
    let query = BlockTest.find(filter);
    
    // Поддержка разных уровней детализации
    if (fields === 'minimal') {
      // Минимальные данные для списка
      query = query.select('classNumber date periodMonth periodYear createdAt _id');
    } else if (fields === 'full') {
      // Полные данные с предметами И вопросами
      query = query.populate('subjectTests.subjectId', 'nameUzb nameRu');
      // НЕ используем .select() чтобы вернуть ВСЕ поля включая questions
    } else if (fields === 'basic') {
      // Базовые данные с предметами но без вопросов
      query = query.select('classNumber date periodMonth periodYear createdAt _id subjectTests.subjectId')
        .populate('subjectTests.subjectId', 'nameUzb nameRu');
    } else {
      // По умолчанию - минимальные данные
      query = query.select('classNumber date periodMonth periodYear createdAt _id');
    }
    
    const blockTests = await query
      .sort({ date: -1 })
      .lean()
      .exec();
    
    console.log(`✅ Found ${blockTests.length} block tests (fields: ${fields || 'minimal'}, class: ${classNumber || 'all'}, date: ${date || 'all'})`);
    
    // Логируем количество вопросов для fields=full
    if (fields === 'full' && blockTests.length > 0) {
      blockTests.forEach((bt: any, idx: number) => {
        console.log(`  📋 Block test ${idx + 1}: ${bt.subjectTests?.length || 0} subjects`);
        bt.subjectTests?.forEach((st: any) => {
          console.log(`    - ${st.subjectId?.nameUzb || 'Unknown'}: ${st.questions?.length || 0} questions`);
        });
      });
    }
    
    // Отключаем все виды кэширования
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json(blockTests);
  } catch (error) {
    console.error('❌ Error fetching block tests:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res) => {
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
    
    // Отключаем кэширование
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
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

    const blockTest = await BlockTest.findById(req.params.id)
      .populate('subjectTests.subjectId')
      .lean();
      
    if (!blockTest) {
      return res.status(404).json({ message: 'Blok test topilmadi' });
    }
    
    console.log(`📚 Block test loaded: ${blockTest.subjectTests?.length || 0} subjects`);
    blockTest.subjectTests?.forEach((st: any) => {
      console.log(`  - ${st.subjectId?.nameUzb || 'Unknown'}: ${st.questions?.length || 0} questions, letter: ${st.groupLetter || 'umumiy'}`);
    });

    // Удаляем старые варианты для этих студентов
    await StudentVariant.deleteMany({
      testId: blockTest._id,
      studentId: { $in: studentIds }
    });
    console.log(`🗑️ Deleted old variants for ${studentIds.length} students`);

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

      // Create a deep copy of the question
      const shuffledQuestion = JSON.parse(JSON.stringify(question));
      
      console.log('🔀 BEFORE shuffle:', {
        text: question.text?.substring(0, 50),
        correctAnswer: question.correctAnswer,
        variants: question.variants.map((v: any) => `${v.letter}: ${v.text?.substring(0, 20)}`)
      });
      
      // Find the original correct answer text
      const originalCorrectVariant = question.variants.find(
        (v: any) => v.letter === question.correctAnswer
      );
      
      if (!originalCorrectVariant) {
        console.log('⚠️ Could not find correct answer:', question.correctAnswer);
        return question; // Can't shuffle if we don't know the correct answer
      }
      
      console.log('✅ Original correct variant:', originalCorrectVariant.text?.substring(0, 30));
      
      // Shuffle the variants array
      const shuffledVariants = shuffleArray([...question.variants]);
      
      console.log('🔄 After shuffleArray:', shuffledVariants.map((v: any) => `${v.letter}: ${v.text?.substring(0, 20)}`));
      
      // Find where the correct answer ended up after shuffling
      const newIndex = shuffledVariants.findIndex(
        (v: any) => v.text === originalCorrectVariant.text
      );
      
      console.log('📍 Correct answer new index:', newIndex);
      
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
        
        console.log('✅ AFTER shuffle:', {
          correctAnswer: shuffledQuestion.correctAnswer,
          variants: shuffledQuestion.variants.map((v: any) => `${v.letter}: ${v.text?.substring(0, 20)}`)
        });
      }
      
      return shuffledQuestion;
    };

    // Batch processing для больших групп студентов (100+)
    const BATCH_SIZE = 50;
    const variants = [];
    
    // Загружаем ВСЕ конфигурации студентов ОДНИМ запросом
    const studentConfigs = await StudentTestConfig.find({ 
      studentId: { $in: studentIds } 
    }).populate('subjects.subjectId').lean();
    
    // Получаем студентов
    const students = await Student.find({ _id: { $in: studentIds } })
      .lean();
    
    console.log(`👥 Found ${students.length} students`);
    
    // Получаем группы студентов через StudentGroup
    const studentGroups = await StudentGroup.find({ 
      studentId: { $in: studentIds } 
    })
      .populate('groupId')
      .lean();
    
    // Создаем Map: studentId -> group
    const studentGroupMap = new Map();
    studentGroups.forEach((sg: any) => {
      // Проверяем что groupId существует
      if (sg.groupId) {
        studentGroupMap.set(sg.studentId.toString(), sg.groupId);
      }
    });
    
    const studentMap = new Map();
    students.forEach(student => {
      const group = studentGroupMap.get(student._id.toString());
      studentMap.set(student._id.toString(), {
        ...student,
        groupId: group
      });
      console.log(`📝 Student ${student.fullName}: groupId=${group?._id}, letter=${group?.letter || 'none'}`);
    });

    // Создаем Map для быстрого доступа по studentId
    const configMap = new Map();
    studentConfigs.forEach(config => {
      configMap.set(config.studentId.toString(), config);
    });
    
    for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
      const batchStudentIds = studentIds.slice(i, i + BATCH_SIZE);
      
      const batchVariants = [];
      
      for (const studentId of batchStudentIds) {
      const variantCode = uuidv4().substring(0, 8).toUpperCase();
      
      const studentConfig = configMap.get(studentId.toString());
      
      if (!studentConfig) {
        continue; // Пропускаем студента без конфигурации
      }
      
      // Shuffle questions WITHIN each subject
      const shuffledQuestions: any[] = [];
      
      for (const subjectConfig of studentConfig.subjects) {
        const subjectId = (subjectConfig.subjectId._id || subjectConfig.subjectId).toString();
        const questionCount = subjectConfig.questionCount;
        const groupLetter = subjectConfig.groupLetter || null; // Берем букву из конфигурации студента
        
        console.log(`🔍 Student config: subject=${subjectId}, groupLetter=${groupLetter || 'umumiy'}, questionCount=${questionCount}`);
        
        // Показываем все доступные тесты для этого предмета
        const availableTests = blockTest.subjectTests.filter(
          (st: any) => (st.subjectId._id || st.subjectId).toString() === subjectId
        );
        console.log(`📚 Available tests for this subject:`, availableTests.map((st: any) => ({
          letter: st.groupLetter || 'umumiy',
          questions: st.questions?.length || 0
        })));
        
        // Находим этот предмет в блок-тесте
        // Сначала ищем с конкретной буквой, если не найдено - берем общий (без буквы)
        let subjectTest = null;
        
        if (groupLetter) {
          subjectTest = blockTest.subjectTests.find(
            (st: any) => {
              const matchSubject = (st.subjectId._id || st.subjectId).toString() === subjectId;
              const matchLetter = st.groupLetter === groupLetter;
              return matchSubject && matchLetter;
            }
          );
          
          if (subjectTest) {
            console.log(`✅ Found test with letter ${groupLetter}`);
          }
        }
        
        // Fallback: если не нашли с конкретной буквой, берем общий тест (без буквы)
        if (!subjectTest) {
          if (groupLetter) {
            console.log(`⚠️ No test found for letter ${groupLetter}, trying general test (umumiy)`);
          }
          subjectTest = blockTest.subjectTests.find(
            (st: any) => {
              const matchSubject = (st.subjectId._id || st.subjectId).toString() === subjectId;
              const isGeneral = !st.groupLetter || st.groupLetter === null;
              return matchSubject && isGeneral;
            }
          );
          
          if (subjectTest) {
            console.log(`✅ Found general test (umumiy)`);
          }
        }
        
        // Fallback 2: если нет общего теста, берем ЛЮБОЙ доступный тест для этого предмета
        if (!subjectTest && availableTests.length > 0) {
          console.log(`⚠️ No general test found, using ANY available test for this subject`);
          subjectTest = availableTests[0];
          console.log(`✅ Using test with letter ${subjectTest.groupLetter || 'umumiy'}`);
        }
        
        if (!subjectTest || !subjectTest.questions || subjectTest.questions.length === 0) {
          console.log(`❌ No test found for subject ${subjectId}. Need to import test with letter ${groupLetter || 'umumiy'}`);
          continue;
        }
        
        console.log(`✅ Using test with ${subjectTest.questions.length} questions, groupLetter: ${subjectTest.groupLetter || 'umumiy'}`);
        
        // Берем только нужное количество вопросов
        const questionsToTake = Math.min(questionCount, subjectTest.questions.length);
        
        // Shuffle questions within this subject
        const subjectQuestions = shuffleArray([...subjectTest.questions]).slice(0, questionsToTake);
        
        // Shuffle answer variants for each question
        for (const question of subjectQuestions) {
          const shuffled = shuffleVariants(question);
          shuffled.subjectId = subjectTest.subjectId;
          shuffledQuestions.push(shuffled);
        }
      }
      
      const qrPayload = variantCode;

      const variant = new StudentVariant({
        testId: blockTest._id,
        testType: 'BlockTest',
        studentId,
        variantCode,
        qrPayload,
        shuffledQuestions
      });

        batchVariants.push(variant);
      }
      
      // Сохраняем batch одним запросом
      if (batchVariants.length > 0) {
        await StudentVariant.insertMany(batchVariants);
        variants.push(...batchVariants);
        
        console.log(`✅ Saved ${batchVariants.length} variants for batch ${Math.floor(i / BATCH_SIZE) + 1}`);
        
        // Логируем первый вариант для проверки
        const firstVariant = batchVariants[0];
        if (firstVariant && firstVariant.shuffledQuestions && firstVariant.shuffledQuestions.length > 0) {
          const firstQuestion = firstVariant.shuffledQuestions[0];
          if (firstQuestion) {
            console.log('📝 Sample question from saved variant:', {
              text: firstQuestion.text?.substring(0, 50),
              correctAnswer: firstQuestion.correctAnswer,
              variants: firstQuestion.variants?.map((v: any) => `${v.letter}: ${v.text?.substring(0, 20)}`)
            });
          }
        }
      }
    }

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

// Экспорт блок-теста в PDF (с правильным рендером формул)
router.get('/:id/export-pdf', authenticate, async (req: AuthRequest, res) => {
  try {
    const blockTestId = req.params.id;
    const studentIds = req.query.students ? (req.query.students as string).split(',') : [];
    
    console.log('📄 Exporting block test to PDF with formulas:', blockTestId, 'Students:', studentIds.length);
    
    // Загружаем блок-тест
    const blockTest = await BlockTest.findById(blockTestId)
      .populate('subjectTests.subjectId', 'nameUzb')
      .lean();
    
    if (!blockTest) {
      return res.status(404).json({ message: 'Block test topilmadi' });
    }
    
    // Проверка доступа
    if (req.user?.branchId && blockTest.branchId?.toString() !== req.user.branchId.toString()) {
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }
    
    // Загружаем все блок-тесты с таким же классом и датой
    const allTests = await BlockTest.find({
      branchId: blockTest.branchId,
      classNumber: blockTest.classNumber,
      periodMonth: blockTest.periodMonth,
      periodYear: blockTest.periodYear
    }).populate('subjectTests.subjectId', 'nameUzb').lean();
    
    // Объединяем все предметы
    const allSubjects: any[] = [];
    allTests.forEach((test: any) => {
      test.subjectTests?.forEach((st: any) => {
        if (st.subjectId) {
          allSubjects.push({ ...st, testId: test._id });
        }
      });
    });
    
    // Загружаем студентов
    const allStudents = await Student.find({ 
      classNumber: blockTest.classNumber,
      branchId: blockTest.branchId
    }).populate('directionId', 'nameUzb').lean();
    
    const selectedStudents = studentIds.length > 0
      ? allStudents.filter((s: any) => studentIds.includes(s._id.toString()))
      : [];
    
    if (selectedStudents.length === 0) {
      return res.status(400).json({ message: 'O\'quvchilar topilmadi' });
    }
    
    // Загружаем конфигурации
    const studentIdsArray = selectedStudents.map((s: any) => s._id.toString());
    const allConfigs = await StudentTestConfig.find({
      studentId: { $in: studentIdsArray }
    }).populate('subjects.subjectId', 'nameUzb').lean();
    
    const configsMap = new Map(allConfigs.map((c: any) => [c.studentId.toString(), c]));
    
    // Загружаем варианты
    const allVariantsMap = new Map<string, any[]>();
    for (const test of allTests) {
      const variants = await StudentVariant.find({
        testId: test._id,
        studentId: { $in: studentIdsArray }
      }).lean();
      
      variants.forEach((v: any) => {
        const key = v.studentId.toString();
        if (!allVariantsMap.has(key)) {
          allVariantsMap.set(key, []);
        }
        allVariantsMap.get(key)!.push(v);
      });
    }
    
    // Генерируем данные для каждого студента
    const students = selectedStudents.map((student: any) => {
      const config = configsMap.get(student._id.toString());
      
      if (!config) {
        console.warn(`⚠️ No config for student ${student.fullName}`);
        return null;
      }
      
      const studentVariants = allVariantsMap.get(student._id.toString()) || [];
      const allShuffledQuestions: any[] = [];
      
      studentVariants.forEach(v => {
        if (v.shuffledQuestions?.length > 0) {
          allShuffledQuestions.push(...v.shuffledQuestions);
        }
      });
      
      console.log(`📊 Found ${allShuffledQuestions.length} shuffled questions for student ${student.fullName}`);
      
      const questions: any[] = [];
      let questionNumber = 1;
      
      if (allShuffledQuestions.length > 0) {
        const questionsBySubject = new Map<string, any>();
        
        if (config.subjects && Array.isArray(config.subjects)) {
          for (const subjectConfig of config.subjects) {
            const subjectId = subjectConfig.subjectId._id?.toString() || subjectConfig.subjectId.toString();
            questionsBySubject.set(subjectId, {
              name: subjectConfig.subjectId.nameUzb,
              count: subjectConfig.questionCount
            });
          }
        }
        
        let currentSubjectIndex = 0;
        const subjectIds = Array.from(questionsBySubject.keys());
        let questionsAdded = 0;
        
        allShuffledQuestions.forEach((q: any) => {
          const currentSubjectId = subjectIds[currentSubjectIndex];
          const subjectData = questionsBySubject.get(currentSubjectId);
          
          if (subjectData && questionsAdded < subjectData.count) {
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
            
            const options = (q.variants || []).map((v: any) => {
              if (typeof v.text === 'string') {
                try {
                  const parsed = JSON.parse(v.text);
                  return convertTiptapToLatex(parsed);
                } catch {
                  return v.text;
                }
              }
              return convertTiptapToLatex(v.text);
            });
            
            questions.push({
              number: questionNumber++,
              subjectName: subjectData.name,
              text: questionText,
              options,
              correctAnswer: q.correctAnswer || ''
            });
            
            questionsAdded++;
            if (questionsAdded >= subjectData.count) {
              currentSubjectIndex++;
              questionsAdded = 0;
            }
          }
        });
      } else {
        console.warn('⚠️ No shuffled questions found, using original questions from subjectTests');
        
        if (config.subjects && Array.isArray(config.subjects)) {
          for (const subjectConfig of config.subjects) {
            const subjectId = subjectConfig.subjectId._id?.toString() || subjectConfig.subjectId.toString();
            const subjectName = (subjectConfig.subjectId as any).nameUzb || '';
            
            const subjectTest = allSubjects.find((st: any) => 
              st.subjectId._id.toString() === subjectId
            );
            
            if (subjectTest && subjectTest.questions) {
              const questionsToAdd = subjectTest.questions.slice(0, subjectConfig.questionCount);
              
              questionsToAdd.forEach((q: any) => {
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
                
                questions.push({
                  number: questionNumber++,
                  subjectName,
                  text: questionText,
                  options,
                  correctAnswer: q.correctAnswer || ''
                });
              });
            }
          }
        }
      }
      
      if (questions.length === 0) {
        console.warn(`⚠️ No questions for student ${student.fullName}`);
        return null;
      }
      
      return {
        studentName: student.fullName,
        variantCode: studentVariants[0]?.variantCode || student._id.toString().slice(-8).toUpperCase(),
        questions
      };
    }).filter((s): s is { studentName: string; variantCode: string; questions: any[] } => s !== null);
    
    if (students.length === 0) {
      return res.status(400).json({ 
        message: 'Savollar topilmadi. Iltimos avval "Aralashtirib berish" tugmasini bosing.' 
      });
    }
    
    const testData = {
      title: `Block Test - ${blockTest.classNumber}-sinf`,
      className: `${blockTest.classNumber}-sinf`,
      questions: [], // Empty questions for multi-student format
      students
    };
    
    // Генерируем PDF через Playwright + KaTeX
    const pdfBuffer = await PDFGeneratorService.generatePDF(testData);
    
    const filename = `block-test-${blockTest.classNumber}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
    
    console.log('✅ PDF exported with formulas');
  } catch (error: any) {
    console.error('❌ Error exporting PDF:', error);
    res.status(500).json({ message: 'PDF yaratishda xatolik', error: error.message });
  }
});

/**
 * Конвертирует TipTap JSON в текст с LaTeX формулами
 */
function convertTiptapToLatex(json: any): string {
  if (!json) return '';
  
  if (typeof json === 'string') {
    return json;
  }
  
  if (!json.type) return '';
  
  let text = '';
  
  if (json.type === 'text') {
    text = json.text || '';
    
    // Обработка marks (формулы)
    if (json.marks) {
      for (const mark of json.marks) {
        if (mark.type === 'formula' && mark.attrs?.latex) {
          text = `$${mark.attrs.latex}$`;
        }
      }
    }
    
    return text;
  }
  
  if (json.type === 'formula' && json.attrs?.latex) {
    return `$${json.attrs.latex}$`;
  }
  
  if (json.type === 'paragraph' || json.type === 'doc') {
    if (json.content && Array.isArray(json.content)) {
      text = json.content.map((node: any) => convertTiptapToLatex(node)).join('');
    }
    return text + (json.type === 'paragraph' ? ' ' : '');
  }
  
  if (json.content && Array.isArray(json.content)) {
    text = json.content.map((node: any) => convertTiptapToLatex(node)).join('');
  }
  
  return text;
}

// ============================================================================
// WORD EXPORT - ASYNC VERSION (Production-ready with Queue)
// ============================================================================

/**
 * Start Word export job for block test (async)
 * POST /block-tests/:id/export-docx-async
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
    const blockTest = await BlockTest.findById(id).select('branchId classNumber').lean();
    if (!blockTest) {
      return res.status(404).json({ message: 'Block test topilmadi' });
    }
    
    if (req.user?.branchId && blockTest.branchId?.toString() !== req.user.branchId.toString()) {
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }
    
    // Add job to queue
    const job = await wordExportQueue.add('export', {
      testId: id,
      studentIds: students,
      settings: settings || {},
      userId: req.user.id || req.user._id?.toString() || 'unknown',
      isBlockTest: true
    }, {
      priority: students.length > 50 ? 2 : 1,
      jobId: `block-test-${id}-${Date.now()}`
    });
    
    console.log(`✅ [API] Job ${job.id} queued for block test ${id} (${students.length} students)`);
    
    res.json({
      jobId: job.id,
      status: 'queued',
      message: 'Export jarayoni boshlandi. Biroz kuting...',
      estimatedTime: Math.ceil(students.length * 0.5)
    });
    
  } catch (error: any) {
    console.error('❌ [API] Error queueing block test export:', error);
    res.status(500).json({ 
      message: 'Xatolik yuz berdi',
      error: error.message 
    });
  }
});

/**
 * Check export job status for block test
 * GET /block-tests/export-status/:jobId
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
    
    if (state === 'failed') {
      return res.json({
        status: 'failed',
        progress: progress,
        error: job.failedReason || 'Unknown error',
        attemptsMade: job.attemptsMade,
        attemptsTotal: job.opts.attempts
      });
    }
    
    res.json({
      status: state,
      progress: progress,
      message: state === 'active' ? 'Ishlanmoqda...' : 'Navbatda...'
    });
    
  } catch (error: any) {
    console.error('❌ [API] Error checking block test status:', error);
    res.status(500).json({ 
      message: 'Xatolik',
      error: error.message 
    });
  }
});

export default router;

// ============================================================================
// WORD EXPORT - SYNC VERSION (Legacy, fallback)
// ============================================================================

// Экспорт блок-теста в Word (с формулами)
router.get('/:id/export-docx', authenticate, async (req: AuthRequest, res) => {
  try {
    const blockTestId = req.params.id;
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
    
    console.log('📄 Exporting block test to Word with formulas:', blockTestId, 'Students:', studentIds.length);
    console.log('🎨 Settings:', settings);
    
    // Загружаем блок-тест
    const blockTest = await BlockTest.findById(blockTestId)
      .populate('subjectTests.subjectId', 'nameUzb')
      .lean();
    
    if (!blockTest) {
      return res.status(404).json({ message: 'Block test topilmadi' });
    }
    
    // Проверка доступа
    if (req.user?.branchId && blockTest.branchId?.toString() !== req.user.branchId.toString()) {
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }
    
    // Загружаем все блок-тесты с таким же классом и датой
    const allTests = await BlockTest.find({
      branchId: blockTest.branchId,
      classNumber: blockTest.classNumber,
      periodMonth: blockTest.periodMonth,
      periodYear: blockTest.periodYear
    }).populate('subjectTests.subjectId', 'nameUzb').lean();
    
    // Объединяем все предметы
    const allSubjects: any[] = [];
    allTests.forEach((test: any) => {
      test.subjectTests?.forEach((st: any) => {
        if (st.subjectId) {
          allSubjects.push({ ...st, testId: test._id });
        }
      });
    });
    
    // Загружаем студентов
    const allStudents = await Student.find({ 
      classNumber: blockTest.classNumber,
      branchId: blockTest.branchId
    }).populate('directionId', 'nameUzb').lean();
    
    const selectedStudents = studentIds.length > 0
      ? allStudents.filter((s: any) => studentIds.includes(s._id.toString()))
      : [];
    
    if (selectedStudents.length === 0) {
      return res.status(400).json({ message: 'O\'quvchilar topilmadi' });
    }
    
    // Загружаем конфигурации
    const studentIdsArray = selectedStudents.map((s: any) => s._id.toString());
    const allConfigs = await StudentTestConfig.find({
      studentId: { $in: studentIdsArray }
    }).populate('subjects.subjectId', 'nameUzb').lean();
    
    const configsMap = new Map(allConfigs.map((c: any) => [c.studentId.toString(), c]));
    
    // Загружаем варианты
    const allVariantsMap = new Map<string, any[]>();
    for (const test of allTests) {
      const variants = await StudentVariant.find({
        testId: test._id,
        studentId: { $in: studentIdsArray }
      }).lean();
      
      variants.forEach((v: any) => {
        const key = v.studentId.toString();
        if (!allVariantsMap.has(key)) {
          allVariantsMap.set(key, []);
        }
        allVariantsMap.get(key)!.push(v);
      });
    }
    
    // Генерируем данные для каждого студента
    const students = selectedStudents.map((student: any) => {
      const config = configsMap.get(student._id.toString());
      
      if (!config) {
        console.warn(`⚠️ No config for student ${student.fullName}`);
        return null;
      }
      
      const studentVariants = allVariantsMap.get(student._id.toString()) || [];
      const allShuffledQuestions: any[] = [];
      
      studentVariants.forEach(v => {
        if (v.shuffledQuestions?.length > 0) {
          allShuffledQuestions.push(...v.shuffledQuestions);
        }
      });
      
      console.log(`📊 Found ${allShuffledQuestions.length} shuffled questions for student ${student.fullName}`);
      
      const questions: any[] = [];
      let questionNumber = 1;
      
      if (allShuffledQuestions.length > 0) {
        const questionsBySubject = new Map<string, any>();
        
        if (config.subjects && Array.isArray(config.subjects)) {
          for (const subjectConfig of config.subjects) {
            const subjectId = subjectConfig.subjectId._id?.toString() || subjectConfig.subjectId.toString();
            questionsBySubject.set(subjectId, {
              name: subjectConfig.subjectId.nameUzb,
              count: subjectConfig.questionCount
            });
          }
        }
        
        let currentSubjectIndex = 0;
        const subjectIds = Array.from(questionsBySubject.keys());
        let questionsAdded = 0;
        
        allShuffledQuestions.forEach((q: any) => {
          const currentSubjectId = subjectIds[currentSubjectIndex];
          const subjectData = questionsBySubject.get(currentSubjectId);
          
          if (subjectData && questionsAdded < subjectData.count) {
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
            
            const options = (q.variants || []).map((v: any) => {
              if (typeof v.text === 'string') {
                try {
                  const parsed = JSON.parse(v.text);
                  return convertTiptapToLatex(parsed);
                } catch {
                  return v.text;
                }
              }
              return convertTiptapToLatex(v.text);
            });
            
            questions.push({
              number: questionNumber++,
              subjectName: subjectData.name,
              text: questionText,
              options,
              correctAnswer: q.correctAnswer || ''
            });
            
            questionsAdded++;
            if (questionsAdded >= subjectData.count) {
              currentSubjectIndex++;
              questionsAdded = 0;
            }
          }
        });
      } else {
        console.warn('⚠️ No shuffled questions found, using original questions from subjectTests');
        
        if (config.subjects && Array.isArray(config.subjects)) {
          for (const subjectConfig of config.subjects) {
            const subjectId = subjectConfig.subjectId._id?.toString() || subjectConfig.subjectId.toString();
            const subjectName = (subjectConfig.subjectId as any).nameUzb || '';
            
            const subjectTest = allSubjects.find((st: any) => 
              st.subjectId._id.toString() === subjectId
            );
            
            if (subjectTest && subjectTest.questions) {
              const questionsToAdd = subjectTest.questions.slice(0, subjectConfig.questionCount);
              
              questionsToAdd.forEach((q: any) => {
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
                
                questions.push({
                  number: questionNumber++,
                  subjectName,
                  text: questionText,
                  options,
                  correctAnswer: q.correctAnswer || ''
                });
              });
            }
          }
        }
      }
      
      if (questions.length === 0) {
        console.warn(`⚠️ No questions for student ${student.fullName}`);
        return null;
      }
      
      return {
        studentName: student.fullName,
        variantCode: studentVariants[0]?.variantCode || student._id.toString().slice(-8).toUpperCase(),
        questions
      };
    }).filter((s): s is { studentName: string; variantCode: string; questions: any[] } => s !== null);
    
    if (students.length === 0) {
      return res.status(400).json({ 
        message: 'Savollar topilmadi. Iltimos avval "Aralashtirib berish" tugmasini bosing.' 
      });
    }
    
    const testData = {
      title: `Block Test - ${blockTest.classNumber}-sinf`,
      className: `${blockTest.classNumber}-sinf`,
      questions: [], // Empty questions for multi-student format
      students,
      settings // Добавляем настройки
    };
    
    // Генерируем Word через Pandoc (с нативными формулами)
    const docxBuffer = await PandocDocxService.generateDocx(testData);
    
    const filename = `block-test-${blockTest.classNumber}-${Date.now()}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(docxBuffer);
    
    console.log('✅ Word exported with formulas');
  } catch (error: any) {
    console.error('❌ Error exporting Word:', error);
    res.status(500).json({ message: 'Word yaratishda xatolik', error: error.message });
  }
});
