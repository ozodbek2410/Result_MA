import express from 'express';
import BlockTest from '../models/BlockTest';
import Student from '../models/Student';
import StudentGroup from '../models/StudentGroup';
import StudentVariant from '../models/StudentVariant';
import StudentTestConfig from '../models/StudentTestConfig';
import { authenticate, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

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
      studentGroupMap.set(sg.studentId.toString(), sg.groupId);
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

export default router;
