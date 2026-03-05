import express from 'express';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import BlockTest from '../models/BlockTest';
import Student from '../models/Student';
import StudentGroup from '../models/StudentGroup';
import StudentVariant from '../models/StudentVariant';
import StudentTestConfig from '../models/StudentTestConfig';
import GroupSubjectConfig from '../models/GroupSubjectConfig';
import TestResult from '../models/TestResult';
import { authenticate, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { PDFExportService } from '../services/pdfExportService';
import { PDFGeneratorService } from '../services/pdfGeneratorService';
import { PandocDocxService } from '../services/pandocDocxService';
import { convertTiptapJsonToText } from '../utils/textUtils';
import { convertVariantText } from '../utils/tiptapConverter';
import wordExportQueue from '../services/queue/wordExportQueue';
import pdfExportQueue from '../services/queue/pdfExportQueue';
import { S3Service } from '../services/s3Service';
import path from 'path';
import fs from 'fs/promises';

const router = express.Router();

// Import block test from file
router.post('/import/confirm', authenticate, async (req: AuthRequest, res) => {
  try {
    console.log('📥 Import request body:', JSON.stringify(req.body, null, 2));
    
    const { questions, classNumber, subjectId, groupLetter, periodMonth, periodYear, groupId, blockTestId } = req.body;

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

    // Edit rejimi: blockTestId bo'lsa ID bo'yicha topish, aks holda qidiruv
    let blockTest;
    if (blockTestId) {
      blockTest = await BlockTest.findById(blockTestId);
      console.log('🔍 Edit mode - found by ID:', blockTest ? blockTest._id : 'not found');
    } else {
      const searchQuery: Record<string, unknown> = {
        branchId: req.user?.branchId,
        classNumber: classNumberNum,
        periodMonth: periodMonthNum,
        periodYear: periodYearNum
      };
      if (groupId) {
        searchQuery.groupId = groupId;
      }
      console.log('🔍 Searching for existing block test with query:', JSON.stringify(searchQuery));
      blockTest = await BlockTest.findOne(searchQuery);
      console.log('🔍 Search result:', blockTest ? `Found: ${blockTest._id}` : 'Not found - will create new');
    }

    if (blockTest) {
      // Edit rejimida asosiy maydonlarni yangilash
      if (blockTestId) {
        blockTest.classNumber = classNumberNum;
        blockTest.periodMonth = periodMonthNum;
        blockTest.periodYear = periodYearNum;
        if (groupId) blockTest.groupId = groupId;
      }

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

      // Eski variantlarni o'chirish (yangi fan qo'shilganda eski variantlar eskiradi)
      const deletedVariants = await StudentVariant.deleteMany({ testId: blockTest._id });
      if (deletedVariants.deletedCount > 0) {
        console.log(`🗑️ Deleted ${deletedVariants.deletedCount} old variants (subjectTests changed)`);
      }
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
        groupId: groupId || undefined,
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
    const periodMonth = req.query.periodMonth as string;
    const periodYear = req.query.periodYear as string;
    const groupId = req.query.groupId as string;

    // Базовый фильтр по филиалу
    const filter: any = {};
    if (req.user?.branchId) {
      filter.branchId = new mongoose.Types.ObjectId(req.user.branchId);
    }

    // Добавляем фильтр по классу если указан
    if (classNumber) {
      filter.classNumber = parseInt(classNumber);
    }

    // Фильтр по periodMonth/periodYear (ishonchliroq)
    if (periodMonth) filter.periodMonth = parseInt(periodMonth);
    if (periodYear) filter.periodYear = parseInt(periodYear);
    if (groupId) filter.groupId = groupId;

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
      query = query.select('classNumber groupId date periodMonth periodYear createdAt _id')
        .populate('groupId', 'name classNumber letter');
    } else if (fields === 'full') {
      query = query.populate('subjectTests.subjectId', 'nameUzb nameRu')
        .populate('groupId', 'name classNumber letter');
    } else if (fields === 'basic') {
      query = query.select('classNumber groupId date periodMonth periodYear createdAt _id subjectTests.subjectId')
        .populate('subjectTests.subjectId', 'nameUzb nameRu')
        .populate('groupId', 'name classNumber letter');
    } else {
      query = query.select('classNumber groupId date periodMonth periodYear createdAt _id')
        .populate('groupId', 'name classNumber letter');
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
    // Validate ObjectId format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'Noto\'g\'ri ID formati' });
    }

    const blockTest = await BlockTest.findById(req.params.id)
      .populate('subjectTests.subjectId', 'nameUzb nameRu')
      .lean()
      .exec();

    if (!blockTest) {
      return res.status(404).json({ message: 'Blok test topilmadi' });
    }

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.json(blockTest);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Error fetching block test:', req.params.id, errMsg);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// Update block test
router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { classNumber, periodMonth, periodYear, subjectTests, groupId } = req.body;

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
    if (groupId) blockTest.groupId = groupId;
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
              questions: st.questions,
              groupLetter: st.groupLetter
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
      .lean() as any;

    if (!blockTest) {
      return res.status(404).json({ message: 'Blok test topilmadi' });
    }

    // Merge related block tests (same periodMonth/periodYear/groupId)
    const mergeFilter: any = {
      classNumber: blockTest.classNumber,
      periodMonth: blockTest.periodMonth,
      periodYear: blockTest.periodYear,
      branchId: blockTest.branchId,
    };
    if (blockTest.groupId) mergeFilter.groupId = blockTest.groupId;

    const relatedTests = await BlockTest.find(mergeFilter)
      .populate('subjectTests.subjectId')
      .lean();

    // Merge all subjects from related tests (deduplicate by subjectId + groupLetter)
    const seen = new Set<string>();
    const allSubjectTests: any[] = [];
    for (const rt of relatedTests) {
      for (const st of (rt as any).subjectTests || []) {
        if (!st.subjectId) continue;
        const sid = (st.subjectId._id || st.subjectId).toString();
        const key = `${sid}_${st.groupLetter || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          allSubjectTests.push(st);
        }
      }
    }

    // Replace subjectTests with merged set
    blockTest.subjectTests = allSubjectTests;

    console.log(`📚 Block test loaded + merged: ${blockTest.subjectTests?.length || 0} subjects from ${relatedTests.length} documents`);
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

    // Helper function to shuffle array
    const shuffleArray = (array: any[]) => {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    // Pinned savollar joylashuvini saqlab, qolganlarini shuffle qilish
    const shuffleWithPinned = (array: any[]) => {
      const pinned = new Map<number, any>(); // original index → question
      const unpinned: any[] = [];
      for (let i = 0; i < array.length; i++) {
        if (array[i].pinned) pinned.set(i, array[i]);
        else unpinned.push(array[i]);
      }
      if (pinned.size === 0) return shuffleArray(array);
      const shuffled = shuffleArray(unpinned);
      const result: any[] = new Array(array.length);
      // Pinned savollarni original indekslariga joylashtirish
      for (const [idx, q] of pinned) result[idx] = q;
      // Bo'sh o'rinlarga shuffled savollarni to'ldirish
      let si = 0;
      for (let i = 0; i < result.length; i++) {
        if (!result[i]) result[i] = shuffled[si++];
      }
      return result;
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
    
    // Build per-student per-subject groupLetter map
    // studentLetterMap: studentId → Map<subjectId, groupLetter>
    const studentLetterMap = new Map<string, Map<string, string>>();
    const studentGroupMap = new Map<string, any>();

    // 1) Per-student assignment from StudentGroup (priority)
    studentGroups.forEach((sg: any) => {
      if (sg.groupId) {
        studentGroupMap.set(sg.studentId.toString(), sg.groupId);
      }
      if (sg.groupLetter && sg.subjectId) {
        const sid = sg.studentId.toString();
        if (!studentLetterMap.has(sid)) studentLetterMap.set(sid, new Map());
        studentLetterMap.get(sid)!.set(sg.subjectId.toString(), sg.groupLetter);
      }
    });

    // 2) Fallback: GroupSubjectConfig (group-level default)
    const groupIds = [...new Set(studentGroups.map((sg: any) => sg.groupId?._id?.toString() || sg.groupId?.toString()).filter(Boolean))];
    const groupConfigs = groupIds.length > 0
      ? await GroupSubjectConfig.find({ groupId: { $in: groupIds } }).lean()
      : [];

    // For each student, fill missing subjects from GroupSubjectConfig
    // BUT only if student has at least one explicit per-subject group letter
    for (const student of students) {
      const sid = student._id.toString();
      if (!studentLetterMap.has(sid)) studentLetterMap.set(sid, new Map());
      const letterMap = studentLetterMap.get(sid)!;
      const sGroups = studentGroups.filter((sg: any) => sg.studentId.toString() === sid);

      // Skip GroupSubjectConfig fallback for students with no per-subject assignments
      const hasPerSubjectAssignment = sGroups.some(
        (sg: any) => sg.subjectId && sg.groupLetter && sg.groupLetter !== '-'
      );
      if (!hasPerSubjectAssignment) continue;

      const sGroupIds = sGroups.map((sg: any) => (sg.groupId?._id?.toString() || sg.groupId?.toString()));
      for (const gc of groupConfigs) {
        const subId = gc.subjectId.toString();
        if (!letterMap.has(subId) && sGroupIds.includes(gc.groupId.toString())) {
          letterMap.set(subId, gc.groupLetter);
        }
      }
    }

    const studentMap = new Map();
    students.forEach(student => {
      const group = studentGroupMap.get(student._id.toString());
      const letters = studentLetterMap.get(student._id.toString());
      studentMap.set(student._id.toString(), {
        ...student,
        groupId: group
      });
      console.log(`📝 Student ${student.fullName}: group=${group?.letter || 'none'}, subjectLetters=${letters ? JSON.stringify(Object.fromEntries(letters)) : 'none'}`);
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

      // Shuffle questions WITHIN each subject
      const shuffledQuestions: any[] = [];

      // === Har bir fan uchun guruh harfi logikasi ===
      // 1. Umumiy savollar → ALOHIDA shuffle (aralashmasdan)
      // 2. Guruh savollar (A,B,C...) → ALOHIDA shuffle (aralashmasdan)
      // 3. Ketma-ket: avval Umumiy, keyin guruh

      const letters = studentLetterMap.get(studentId.toString()) || new Map();

      // Fanlarni guruhlash (unique subjectId lar)
      const subjectMap = new Map<string, typeof blockTest.subjectTests>();
      for (const st of blockTest.subjectTests) {
        if (!st.questions || st.questions.length === 0) continue;
        const sid = (st.subjectId._id || st.subjectId).toString();
        if (!subjectMap.has(sid)) subjectMap.set(sid, []);
        subjectMap.get(sid)!.push(st);
      }

      if (studentConfig && studentConfig.subjects && studentConfig.subjects.length > 0) {
        // === Config mavjud ===
        for (const subjectConfig of studentConfig.subjects) {
          const subjectId = (subjectConfig.subjectId._id || subjectConfig.subjectId).toString();
          const questionCount = subjectConfig.questionCount;
          const studentLetter = subjectConfig.groupLetter || letters.get(subjectId) || null;

          const subjectTests = subjectMap.get(subjectId) || [];

          // Umumiy va guruh savollarini ALOHIDA-ALOHIDA aralshtirish
          const generalTests: any[] = [];
          const letterTests: any[] = [];
          for (const st of subjectTests) {
            if (!st.groupLetter) generalTests.push(st);
            else if (studentLetter && st.groupLetter === studentLetter) letterTests.push(st);
          }

          if (generalTests.length === 0 && letterTests.length === 0) continue;

          // Umumiy savollar — alohida shuffle
          let generalQs: any[] = [];
          for (const mt of generalTests) generalQs = generalQs.concat(mt.questions);
          const shuffledGeneral = shuffleWithPinned(generalQs);

          // Guruh savollar — alohida shuffle
          let letterQs: any[] = [];
          for (const mt of letterTests) letterQs = letterQs.concat(mt.questions);
          const shuffledLetter = shuffleWithPinned(letterQs);

          // Ketma-ket: avval umumiy (alohida aralashgan), keyin guruh (alohida aralashgan)
          const combined = [...shuffledGeneral, ...shuffledLetter];
          const questionsToTake = Math.min(questionCount, combined.length);

          for (let i = 0; i < questionsToTake; i++) {
            const shuffled = shuffleVariants(combined[i]);
            shuffled.subjectId = (generalTests[0] || letterTests[0]).subjectId;
            shuffled.studentGroupLetter = studentLetter || null;
            shuffledQuestions.push(shuffled);
          }
        }

        // === Umumiy fanlar: config'da bo'lmasa ham barcha o'quvchilarga qo'shish ===
        const configSubjectIds = new Set(
          studentConfig.subjects.map((sc: any) => (sc.subjectId._id || sc.subjectId).toString())
        );
        for (const [subjectId, subjectTests] of subjectMap) {
          if (configSubjectIds.has(subjectId)) continue; // already processed
          const generalTests = subjectTests.filter((st: any) => !st.groupLetter);
          if (generalTests.length === 0) continue;
          console.log(`➕ Adding umumiy-only subject for student (not in config): ${subjectId}`);
          for (const mt of generalTests) {
            for (const question of shuffleWithPinned([...mt.questions])) {
              const shuffled = shuffleVariants(question);
              shuffled.subjectId = mt.subjectId;
              shuffledQuestions.push(shuffled);
            }
          }
        }
      } else {
        // === Config yo'q — barcha fanlarni tekshirish ===

        for (const [subjectId, subjectTests] of subjectMap) {
          const studentLetter = letters.get(subjectId) || null;
          const matchingTests: any[] = [];

          // Umumiy va guruh savollarini ALOHIDA ajratish
          const generalTests: any[] = [];
          const letterTests: any[] = [];
          for (const st of subjectTests) {
            if (!st.groupLetter) generalTests.push(st);
            else if (studentLetter && st.groupLetter === studentLetter) letterTests.push(st);
          }

          if (generalTests.length === 0 && letterTests.length === 0) continue;

          // Avval Umumiy — alohida shuffle (pinned hurmat qilinadi)
          for (const mt of generalTests) {
            for (const question of shuffleWithPinned([...mt.questions])) {
              const shuffled = shuffleVariants(question);
              shuffled.subjectId = mt.subjectId;
              shuffled.studentGroupLetter = studentLetter || null;
              shuffledQuestions.push(shuffled);
            }
          }
          // Keyin guruh — alohida shuffle (pinned hurmat qilinadi)
          for (const mt of letterTests) {
            for (const question of shuffleWithPinned([...mt.questions])) {
              const shuffled = shuffleVariants(question);
              shuffled.subjectId = mt.subjectId;
              shuffled.studentGroupLetter = studentLetter || null;
              shuffledQuestions.push(shuffled);
            }
          }
        }
      }
      
      // Skip empty variants (student has no matching subjects)
      if (shuffledQuestions.length === 0) {
        console.log(`⏭️ Skipping student ${studentId} — no matching subjects`);
        continue;
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
  req.setTimeout(0);
  res.setTimeout(0);
  try {
    const blockTestId = req.params.id;
    const studentIds = req.query.students ? (req.query.students as string).split(',') : [];
    
    console.log('📄 Exporting block test to PDF with formulas:', blockTestId, 'Students:', studentIds.length);

    const blockTest = await BlockTest.findById(blockTestId)
      .populate('subjectTests.subjectId', 'nameUzb')
      .lean();

    if (!blockTest) {
      return res.status(404).json({ message: 'Block test topilmadi' });
    }

    if (req.user?.branchId && blockTest.branchId?.toString() !== req.user.branchId.toString()) {
      return res.status(403).json({ message: "Ruxsat yo'q" });
    }

    const allTests = await BlockTest.find({
      branchId: blockTest.branchId,
      classNumber: blockTest.classNumber,
      periodMonth: blockTest.periodMonth,
      periodYear: blockTest.periodYear
    }).populate('subjectTests.subjectId', 'nameUzb').lean();

    const allSubjects: any[] = [];
    allTests.forEach((test: any) => {
      test.subjectTests?.forEach((st: any) => {
        if (st.subjectId) {
          allSubjects.push({ ...st, testId: test._id });
        }
      });
    });

    // Load students directly by ID
    const selectedStudents = studentIds.length > 0
      ? await Student.find({ _id: { $in: studentIds } }).populate('directionId', 'nameUzb').lean()
      : [];

    if (selectedStudents.length === 0) {
      return res.status(400).json({ message: "O'quvchilar topilmadi" });
    }

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
      const studentVariants = allVariantsMap.get(student._id.toString()) || [];
      const allShuffledQuestions: any[] = [];

      studentVariants.forEach(v => {
        if (v.shuffledQuestions?.length > 0) {
          allShuffledQuestions.push(...v.shuffledQuestions);
        }
      });

      // Check staleness: compare shuffled count against config totalQuestions (not raw subjectTests)
      const expectedTotal = config?.totalQuestions || 0;
      const hasShuffled = allShuffledQuestions.length > 0;
      const shuffledMatch = hasShuffled && (expectedTotal === 0 || allShuffledQuestions.length === expectedTotal);

      console.log(`📊 Student ${student.fullName}: ${allShuffledQuestions.length} shuffled, expected: ${expectedTotal}, match: ${shuffledMatch}, hasConfig: ${!!config}`);

      const questions: any[] = [];
      let questionNumber = 1;

      if (hasShuffled && shuffledMatch) {
        // Shuffled savollar to'liq — ularni ishlatish
        allShuffledQuestions.forEach((q: any) => {
          questions.push(convertQuestionForExport(q, questionNumber++, ''));
        });
      } else if (hasShuffled && !shuffledMatch) {
        // Shuffled stale — lekin mavjud bo'lsa ishlatamiz (faqat warning)
        console.warn(`⚠️ Shuffled count mismatch (${allShuffledQuestions.length} vs expected ${expectedTotal}), using shuffled anyway`);
        allShuffledQuestions.forEach((q: any) => {
          questions.push(convertQuestionForExport(q, questionNumber++, ''));
        });
      } else if (config && config.subjects && Array.isArray(config.subjects)) {
        // Config mavjud, lekin shuffle qilinmagan — original savollardan foydalanish
        console.warn('⚠️ No shuffled questions, using original from config subjects');
        for (const subjectConfig of config.subjects) {
          const subjectId = subjectConfig.subjectId._id?.toString() || subjectConfig.subjectId.toString();
          const subjectName = (subjectConfig.subjectId as any).nameUzb || '';
          const subjectTest = allSubjects.find((st: any) =>
            (st.subjectId._id || st.subjectId).toString() === subjectId
          );
          if (subjectTest && subjectTest.questions) {
            subjectTest.questions.slice(0, subjectConfig.questionCount).forEach((q: any) => {
              questions.push(convertQuestionForExport(q, questionNumber++, subjectName));
            });
          }
        }
      } else {
        // Config ham yo'q — blok testning barcha savollarini to'g'ridan-to'g'ri ishlatish
        console.warn(`⚠️ No config for ${student.fullName}, using all subjectTests directly`);
        for (const st of allSubjects) {
          const subjectName = st.subjectId?.nameUzb || '';
          if (st.questions) {
            st.questions.forEach((q: any) => {
              questions.push(convertQuestionForExport(q, questionNumber++, subjectName));
            });
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
      questions: [],
      students,
      settings: {
        fontSize: req.query.fontSize ? parseInt(req.query.fontSize as string) : undefined,
        fontFamily: req.query.fontFamily as string | undefined,
        lineHeight: req.query.lineHeight ? parseFloat(req.query.lineHeight as string) : undefined,
        columnsCount: req.query.columnsCount ? parseInt(req.query.columnsCount as string) : undefined,
        backgroundOpacity: req.query.backgroundOpacity ? parseFloat(req.query.backgroundOpacity as string) : undefined,
      }
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
 * Start PDF export job (async)
 * POST /block-tests/:id/export-pdf-async
 */
router.post('/:id/export-pdf-async', authenticate, async (req: AuthRequest, res) => {
  req.setTimeout(0);
  res.setTimeout(0);
  try {
    const { id } = req.params;
    const { students, settings } = req.body;

    if (process.env.REDIS_ENABLED !== 'true') {
      return res.status(503).json({
        message: 'Queue service mavjud emas, sync versiya ishlatiladi',
        error: 'redis_disabled'
      });
    }

    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({
        message: "O'quvchilar tanlanmagan",
        error: 'students array is required'
      });
    }

    const blockTest = await BlockTest.findById(id).select('branchId classNumber').lean();
    if (!blockTest) {
      return res.status(404).json({ message: 'Block test topilmadi' });
    }

    if (req.user?.branchId && blockTest.branchId?.toString() !== req.user.branchId.toString()) {
      return res.status(403).json({ message: "Ruxsat yo'q" });
    }

    const job = await pdfExportQueue.add('export', {
      testId: id,
      studentIds: students,
      userId: req.user?.id || 'unknown',
      isBlockTest: true,
      settings
    }, {
      priority: students.length > 50 ? 2 : 1,
      jobId: `pdf-blocktest-${id}-${Date.now()}`
    });

    console.log(`✅ [API] PDF Job ${job.id} queued for block test ${id} (${students.length} students)`);

    res.json({
      jobId: job.id,
      status: 'queued',
      message: 'PDF yaratilmoqda. Biroz kuting...',
      estimatedTime: Math.ceil(students.length * 1.5)
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [API] Error queueing PDF export:', msg);
    res.status(500).json({ message: 'Xatolik yuz berdi', error: msg });
  }
});

/**
 * Booklet PDF export (kitobcha format)
 * POST /block-tests/:id/export-booklet-pdf-async
 */
router.post('/:id/export-booklet-pdf-async', authenticate, async (req: AuthRequest, res) => {
  req.setTimeout(0);
  res.setTimeout(0);
  try {
    const { id } = req.params;
    const { students, settings } = req.body;

    if (process.env.REDIS_ENABLED !== 'true') {
      return res.status(503).json({ message: 'Queue service mavjud emas', error: 'redis_disabled' });
    }
    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ message: "O'quvchilar tanlanmagan" });
    }

    const blockTest = await BlockTest.findById(id).select('branchId classNumber').lean();
    if (!blockTest) return res.status(404).json({ message: 'Block test topilmadi' });

    if (req.user?.branchId && blockTest.branchId?.toString() !== req.user.branchId.toString()) {
      return res.status(403).json({ message: "Ruxsat yo'q" });
    }

    const job = await pdfExportQueue.add('export', {
      testId: id,
      studentIds: students,
      userId: req.user?.id || 'unknown',
      isBlockTest: true,
      booklet: true,
      settings
    }, {
      priority: students.length > 50 ? 2 : 1,
      jobId: `booklet-blocktest-${id}-${Date.now()}`
    });

    res.json({
      jobId: job.id,
      status: 'queued',
      message: 'Kitobcha PDF yaratilmoqda...',
      estimatedTime: Math.ceil(students.length * 2)
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [API] Error queueing booklet export:', msg);
    res.status(500).json({ message: 'Xatolik yuz berdi', error: msg });
  }
});

/**
 * Check PDF export job status
 * GET /block-tests/pdf-export-status/:jobId
 */
router.get('/pdf-export-status/:jobId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { jobId } = req.params;
    const job = await pdfExportQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ status: 'not_found', message: 'Job topilmadi' });
    }

    const state = await job.getState();
    const progress = job.progress;

    if (state === 'completed') {
      return res.json({ status: 'completed', progress: 100, result: job.returnvalue });
    }

    if (state === 'failed') {
      return res.json({ status: 'failed', error: job.failedReason || 'Unknown error' });
    }

    res.json({ status: state, progress: progress || 0 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [API] Error checking PDF job status:', msg);
    res.status(500).json({ message: 'Status tekshirishda xatolik', error: msg });
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

/**
 * Savolni export formatiga o'girish (PDF/Word uchun umumiy helper)
 */
function convertQuestionForExport(q: any, questionNumber: number, _subjectName: string) {
  const questionText = convertVariantText(q.text);

  const variantsArr = q.variants || q.options || [];
  const options = variantsArr.map((v: any) => {
    if (typeof v === 'string') return convertVariantText(v);
    return convertVariantText(v.text);
  });

  // Deduplicate: collect unique image URLs only
  const uniqueImages: { type: string; url: string; position: string }[] = [];
  const seenUrls = new Set<string>();

  const normalizeUrl = (url: string) => url.replace(/^https?:\/\/[^/]+/, '').replace(/\\/g, '/');

  if (q.imageUrl) {
    seenUrls.add(normalizeUrl(q.imageUrl));
    uniqueImages.push({ type: 'image', url: q.imageUrl, position: 'after' });
  }
  if (q.media && Array.isArray(q.media)) {
    for (const m of q.media) {
      if (m.url && !seenUrls.has(normalizeUrl(m.url))) {
        seenUrls.add(normalizeUrl(m.url));
        uniqueImages.push({ type: m.type || 'image', url: m.url, position: m.position || 'after' });
      }
    }
  }

  return {
    number: questionNumber,
    text: questionText,
    contextText: q.contextText || undefined,
    contextImage: q.contextImage || undefined,
    contextImageWidth: q.contextImageWidth || undefined,
    contextImageHeight: q.contextImageHeight || undefined,
    options,
    correctAnswer: q.correctAnswer || '',
    imageUrl: undefined, // Only use media[] to avoid duplicates
    media: uniqueImages.length > 0 ? uniqueImages : undefined,
    imageWidth: q.imageWidth || undefined,
    imageHeight: q.imageHeight || undefined
  };
}

/** Deep extract all text/latex from any nested JSON structure */
function extractAllText(obj: any): string {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'number') return String(obj);

  let result = '';

  // Direct text field
  if (obj.text && typeof obj.text === 'string') {
    result += obj.text;
  }
  // Formula
  if (obj.attrs?.latex) {
    result += `$${obj.attrs.latex}$`;
  }
  // Recurse into content array
  if (Array.isArray(obj.content)) {
    result += obj.content.map((c: any) => extractAllText(c)).join('');
  }
  // Recurse into marks
  if (Array.isArray(obj.marks)) {
    for (const mark of obj.marks) {
      if (mark.attrs?.latex) {
        result = `$${mark.attrs.latex}$`;
      }
    }
  }

  return result;
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

    // Redis o'chirilgan bo'lsa sync versiyaga yo'naltirish
    if (process.env.REDIS_ENABLED !== 'true') {
      return res.status(503).json({
        message: 'Queue service mavjud emas, sync versiya ishlatiladi',
        error: 'redis_disabled'
      });
    }

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
      userId: req.user?.id || 'unknown',
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

// ─── EXCEL EXPORT FOR BLOCK TEST ───────────────────────────────────────────────
router.get('/:id/export-excel', authenticate, async (req: AuthRequest, res) => {
  try {
    const blockTestId = req.params.id;

    const blockTest = await BlockTest.findById(blockTestId)
      .populate('subjectTests.subjectId', 'nameUzb')
      .populate('groupId', 'name letter')
      .lean();

    if (!blockTest) {
      return res.status(404).json({ message: 'Blok test topilmadi' });
    }

    const groupIdStr = blockTest.groupId
      ? (typeof blockTest.groupId === 'object' ? (blockTest.groupId as any)._id : blockTest.groupId)
      : undefined;

    const relatedFilter: Record<string, unknown> = {
      classNumber: blockTest.classNumber,
      periodMonth: blockTest.periodMonth,
      periodYear: blockTest.periodYear,
      branchId: blockTest.branchId,
    };
    if (groupIdStr) relatedFilter.groupId = groupIdStr;

    const relatedTests = await BlockTest.find(relatedFilter)
      .populate('subjectTests.subjectId', 'nameUzb')
      .lean();

    const allSubjects: { subjectId: any; subjectIdStr: string; groupLetter?: string; questionsCount: number }[] = [];
    for (const rt of relatedTests) {
      for (const st of rt.subjectTests || []) {
        if (st.subjectId) {
          const sid = (st.subjectId as any)?._id?.toString() || (st.subjectId as any)?.toString();
          allSubjects.push({ subjectId: st.subjectId, subjectIdStr: sid, groupLetter: st.groupLetter, questionsCount: st.questions?.length || 0 });
        }
      }
    }

    const studentFilter: Record<string, unknown> = groupIdStr ? { groupId: groupIdStr } : { classNumber: blockTest.classNumber };
    const students = await Student.find(studentFilter).sort({ fullName: 1 }).lean();
    const studentIds = students.map(s => s._id);

    const allTestIds = relatedTests.map(t => t._id);
    console.log('📊 EXCEL DEBUG: allTestIds =', allTestIds.map(id => id.toString()));
    console.log('📊 EXCEL DEBUG: studentIds count =', studentIds.length);
    console.log('📊 EXCEL DEBUG: studentFilter =', JSON.stringify(studentFilter));

    const results = await TestResult.find({ blockTestId: { $in: allTestIds }, studentId: { $in: studentIds } }).lean();
    const resultMap = new Map<string, any>();
    for (const r of results) { resultMap.set(r.studentId.toString(), r); }
    console.log('📊 EXCEL DEBUG: TestResults found =', results.length);

    const variants = await StudentVariant.find({ testId: { $in: allTestIds }, testType: 'BlockTest', studentId: { $in: studentIds } }).lean();
    const variantMap = new Map<string, any>();
    for (const v of variants) { variantMap.set(v.studentId.toString(), v); }
    console.log('📊 EXCEL DEBUG: StudentVariants found =', variants.length);

    // Debug: log first variant's shuffledQuestions subjectId format
    if (variants.length > 0) {
      const firstV = variants[0];
      console.log('📊 EXCEL DEBUG: first variant testId =', firstV.testId?.toString());
      console.log('📊 EXCEL DEBUG: first variant studentId =', firstV.studentId?.toString());
      console.log('📊 EXCEL DEBUG: first variant shuffledQuestions count =', firstV.shuffledQuestions?.length || 0);
      if (firstV.shuffledQuestions && firstV.shuffledQuestions.length > 0) {
        const q0 = firstV.shuffledQuestions[0];
        console.log('📊 EXCEL DEBUG: q0.subjectId =', JSON.stringify(q0?.subjectId));
        console.log('📊 EXCEL DEBUG: q0.subjectId type =', typeof q0?.subjectId);
        if (q0?.subjectId && typeof q0.subjectId === 'object') {
          console.log('📊 EXCEL DEBUG: q0.subjectId._id =', q0.subjectId._id?.toString());
          console.log('📊 EXCEL DEBUG: q0.subjectId keys =', Object.keys(q0.subjectId));
        }
      }
    }

    interface SubjectCol { name: string; subjectIdStr: string; groupLetter?: string; questionsCount: number }
    const subjectCols: SubjectCol[] = [];
    const seenSubjects = new Set<string>();
    for (const s of allSubjects) {
      const subName = (s.subjectId as any)?.nameUzb || 'Fan';
      const key = `${s.subjectIdStr}_${s.groupLetter || ''}`;
      if (!seenSubjects.has(key)) {
        seenSubjects.add(key);
        subjectCols.push({ name: subName, subjectIdStr: s.subjectIdStr, groupLetter: s.groupLetter, questionsCount: s.questionsCount });
      }
    }
    console.log('📊 EXCEL DEBUG: subjectCols =', subjectCols.map(sc => ({ name: sc.name, id: sc.subjectIdStr, letter: sc.groupLetter })));

    // Helper: extract subjectId string from shuffledQuestion
    const getSubId = (q: any): string => {
      if (!q?.subjectId) return 'unknown';
      if (typeof q.subjectId === 'string') return q.subjectId;
      if (q.subjectId._id) return q.subjectId._id.toString();
      return q.subjectId.toString();
    };

    type SubjectScores = Map<string, { correct: number; total: number }>;
    const studentSubjectScores = new Map<string, SubjectScores>();
    for (const student of students) {
      const sid = student._id.toString();
      const result = resultMap.get(sid);
      const variant = variantMap.get(sid);
      if (!result || !variant?.shuffledQuestions?.length) {
        if (!result) console.log('📊 EXCEL DEBUG: no result for student', sid, student.fullName);
        if (!variant) console.log('📊 EXCEL DEBUG: no variant for student', sid, student.fullName);
        else if (!variant.shuffledQuestions?.length) console.log('📊 EXCEL DEBUG: empty shuffledQuestions for student', sid);
        continue;
      }
      const scores: SubjectScores = new Map();
      for (let i = 0; i < variant.shuffledQuestions.length; i++) {
        const subId = getSubId(variant.shuffledQuestions[i]);
        if (!scores.has(subId)) scores.set(subId, { correct: 0, total: 0 });
        const entry = scores.get(subId)!;
        entry.total++;
        if (result.answers?.[i]?.isCorrect) entry.correct++;
      }
      studentSubjectScores.set(sid, scores);
      // Log first student's scores for debugging
      if (studentSubjectScores.size === 1) {
        console.log('📊 EXCEL DEBUG: first student scores:', student.fullName);
        scores.forEach((v, k) => console.log('  subId:', k, '→', v.correct, '/', v.total));
        console.log('📊 EXCEL DEBUG: subjectCols ids:', subjectCols.map(sc => sc.subjectIdStr));
      }
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Natijalar');

    const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
    const subHeaderFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } };
    const lightRowFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
    const whiteRowFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    const greenFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    const yellowFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
    const redFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    const subHeaderFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    const bodyFont: Partial<ExcelJS.Font> = { size: 10 };
    const boldFont: Partial<ExcelJS.Font> = { bold: true, size: 10 };
    const border: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFC7D2FE' } }, left: { style: 'thin', color: { argb: 'FFC7D2FE' } },
      bottom: { style: 'thin', color: { argb: 'FFC7D2FE' } }, right: { style: 'thin', color: { argb: 'FFC7D2FE' } },
    };

    const columns: Partial<ExcelJS.Column>[] = [{ key: 'num', width: 5 }, { key: 'name', width: 32 }];
    subjectCols.forEach((_, i) => { columns.push({ key: `subj_${i}`, width: 18 }); });
    columns.push({ key: 'total', width: 14 }, { key: 'percent', width: 12 });
    ws.columns = columns;

    const periodName = `${blockTest.periodMonth}/${blockTest.periodYear}`;
    const groupName = blockTest.groupId ? ` | ${(blockTest.groupId as any).name || (blockTest.groupId as any).letter || ''}` : '';
    const titleRow = ws.addRow([`Blok test natijalar — ${blockTest.classNumber}-sinf${groupName} | ${periodName}`]);
    ws.mergeCells(titleRow.number, 1, titleRow.number, columns.length);
    titleRow.getCell(1).fill = headerFill; titleRow.getCell(1).font = headerFont;
    titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }; titleRow.height = 36;

    const totalQ = allSubjects.reduce((s, x) => s + x.questionsCount, 0);
    const infoRow = ws.addRow([`O'quvchilar: ${students.length} | Fanlar: ${subjectCols.length} | Jami savollar: ${totalQ}`]);
    ws.mergeCells(infoRow.number, 1, infoRow.number, columns.length);
    infoRow.getCell(1).fill = subHeaderFill; infoRow.getCell(1).font = subHeaderFont;
    infoRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }; infoRow.height = 24;

    const headerValues: string[] = ['№', "F.I.O"];
    subjectCols.forEach(sc => {
      const label = sc.groupLetter ? `${sc.name} (${sc.groupLetter})` : sc.name;
      headerValues.push(`${label}\n(${sc.questionsCount} ta)`);
    });
    headerValues.push('Jami ball', 'Foiz (%)');
    const colHeaderRow = ws.addRow(headerValues);
    colHeaderRow.eachCell((cell) => {
      cell.fill = headerFill; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.border = border; cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    colHeaderRow.height = 40;

    students.forEach((student, idx) => {
      const sid = student._id.toString();
      const result = resultMap.get(sid);
      const perSubject = studentSubjectScores.get(sid);
      const rowValues: (string | number)[] = [idx + 1, student.fullName || "Noma'lum"];
      subjectCols.forEach(sc => {
        if (perSubject) {
          const score = perSubject.get(sc.subjectIdStr);
          rowValues.push(score ? `${score.correct}/${score.total}` : '-');
        } else { rowValues.push('-'); }
      });
      if (result) {
        rowValues.push(`${result.totalPoints ?? 0}/${result.maxPoints ?? 0}`);
        rowValues.push(`${Math.round(result.percentage ?? 0)}%`);
      } else { rowValues.push('-', '-'); }

      const row = ws.addRow(rowValues);
      const isEven = idx % 2 === 0;
      row.eachCell((cell) => { cell.fill = isEven ? lightRowFill : whiteRowFill; cell.font = bodyFont; cell.border = border; cell.alignment = { vertical: 'middle' }; });
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }; row.getCell(1).font = boldFont;
      for (let i = 3; i <= 2 + subjectCols.length; i++) {
        row.getCell(i).alignment = { vertical: 'middle', horizontal: 'center' };
        if (perSubject) {
          const sc = subjectCols[i - 3]; const score = perSubject.get(sc.subjectIdStr);
          if (score && score.total > 0) {
            const pct = (score.correct / score.total) * 100;
            if (pct >= 70) { row.getCell(i).fill = greenFill; row.getCell(i).font = { size: 10, color: { argb: 'FF166534' } }; }
            else if (pct < 40) { row.getCell(i).fill = redFill; row.getCell(i).font = { size: 10, color: { argb: 'FF991B1B' } }; }
          }
        }
      }
      const totalCol = 3 + subjectCols.length;
      row.getCell(totalCol).alignment = { vertical: 'middle', horizontal: 'center' }; row.getCell(totalCol).font = boldFont;
      const pctCol = totalCol + 1;
      row.getCell(pctCol).alignment = { vertical: 'middle', horizontal: 'center' };
      if (result) {
        const pct = result.percentage ?? 0;
        if (pct >= 70) { row.getCell(pctCol).fill = greenFill; row.getCell(pctCol).font = { bold: true, size: 10, color: { argb: 'FF166534' } }; }
        else if (pct >= 40) { row.getCell(pctCol).fill = yellowFill; row.getCell(pctCol).font = { bold: true, size: 10, color: { argb: 'FF854D0E' } }; }
        else { row.getCell(pctCol).fill = redFill; row.getCell(pctCol).font = { bold: true, size: 10, color: { argb: 'FF991B1B' } }; }
      }
      row.height = 24;
    });

    if (results.length > 0) {
      const avgPct = results.reduce((s, r) => s + (r.percentage || 0), 0) / results.length;
      ws.addRow([]);
      const summaryHeader = ws.addRow(['', 'Statistika']);
      summaryHeader.getCell(2).font = { bold: true, size: 11 };
      const statsData: (string | number)[][] = [
        ['', "O'rtacha foiz", `${Math.round(avgPct)}%`],
        ['', 'Eng yuqori ball', Math.max(...results.map(r => r.totalPoints || 0))],
        ['', 'Eng past ball', Math.min(...results.map(r => r.totalPoints || 0))],
        ['', 'Natija bor', `${results.length} / ${students.length}`],
      ];
      statsData.forEach(row => {
        const r = ws.addRow(row);
        r.getCell(2).font = boldFont; r.getCell(3).font = bodyFont; r.getCell(2).border = border; r.getCell(3).border = border;
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
    const safeName = `Blok_test_${blockTest.classNumber}sinf_${blockTest.periodMonth}_${blockTest.periodYear}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error('❌ Error exporting block test Excel:', error);
    res.status(500).json({ message: 'Excel export xatosi', error: error.message });
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

    // Load students directly by ID
    const selectedStudents = studentIds.length > 0
      ? await Student.find({ _id: { $in: studentIds } }).populate('directionId', 'nameUzb').lean()
      : [];

    if (selectedStudents.length === 0) {
      return res.status(400).json({ message: "O'quvchilar topilmadi" });
    }

    const studentIdsArray = selectedStudents.map((s: any) => s._id.toString());
    const allConfigs = await StudentTestConfig.find({
      studentId: { $in: studentIdsArray }
    }).populate('subjects.subjectId', 'nameUzb').lean();

    const configsMap = new Map(allConfigs.map((c: any) => [c.studentId.toString(), c]));

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
      const studentVariants = allVariantsMap.get(student._id.toString()) || [];
      const allShuffledQuestions: any[] = [];

      studentVariants.forEach(v => {
        if (v.shuffledQuestions?.length > 0) {
          allShuffledQuestions.push(...v.shuffledQuestions);
        }
      });

      const expectedTotal = config?.totalQuestions || 0;
      const hasShuffled = allShuffledQuestions.length > 0;
      const shuffledMatch = hasShuffled && (expectedTotal === 0 || allShuffledQuestions.length === expectedTotal);

      console.log(`📊 Word: Student ${student.fullName}: ${allShuffledQuestions.length} shuffled, expected: ${expectedTotal}, match: ${shuffledMatch}`);

      const questions: any[] = [];
      let questionNumber = 1;

      if (hasShuffled && shuffledMatch) {
        allShuffledQuestions.forEach((q: any) => {
          questions.push(convertQuestionForExport(q, questionNumber++, ''));
        });
      } else if (hasShuffled && !shuffledMatch) {
        console.warn(`⚠️ Word: Shuffled count mismatch (${allShuffledQuestions.length} vs expected ${expectedTotal}), using shuffled anyway`);
        allShuffledQuestions.forEach((q: any) => {
          questions.push(convertQuestionForExport(q, questionNumber++, ''));
        });
      } else if (config && config.subjects && Array.isArray(config.subjects)) {
        console.warn('⚠️ No shuffled questions, using original from config subjects');
        for (const subjectConfig of config.subjects) {
          const subjectId = subjectConfig.subjectId._id?.toString() || subjectConfig.subjectId.toString();
          const subjectTest = allSubjects.find((st: any) =>
            (st.subjectId._id || st.subjectId).toString() === subjectId
          );
          if (subjectTest && subjectTest.questions) {
            subjectTest.questions.slice(0, subjectConfig.questionCount).forEach((q: any) => {
              questions.push(convertQuestionForExport(q, questionNumber++, ''));
            });
          }
        }
      } else {
        console.warn(`⚠️ No config for ${student.fullName}, using all subjectTests directly`);
        for (const st of allSubjects) {
          if (st.questions) {
            st.questions.forEach((q: any) => {
              questions.push(convertQuestionForExport(q, questionNumber++, ''));
            });
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
      settings
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

// ============================================================================
// ANSWER SHEETS (JAVOB VARAQASI) PDF EXPORT FOR BLOCK TESTS
// ============================================================================

/**
 * Export Answer Sheets (bubble sheets) as PDF for Block Test
 * GET /block-tests/:id/export-answer-sheets-pdf
 */
router.post('/:id/export-answer-sheets-pdf', authenticate, async (req: AuthRequest, res) => {
  try {
    const blockTestId = req.params.id;
    // Support both POST body and query string
    const rawStudents = req.body?.students || req.query.students || '';
    const studentIds = Array.isArray(rawStudents)
      ? rawStudents as string[]
      : typeof rawStudents === 'string' && rawStudents.length > 0
        ? rawStudents.split(',')
        : [];

    const blockTest = await BlockTest.findById(blockTestId)
      .populate('subjectTests.subjectId', 'nameUzb')
      .lean();

    if (!blockTest) {
      return res.status(404).json({ message: 'Block test topilmadi' });
    }

    // Get block tests for this group (not all groups in the class)
    const groupFilter: Record<string, unknown> = {
      branchId: blockTest.branchId,
      classNumber: blockTest.classNumber,
      periodMonth: blockTest.periodMonth,
      periodYear: blockTest.periodYear,
    };
    if (blockTest.groupId) groupFilter.groupId = blockTest.groupId;
    const allTests = await BlockTest.find(groupFilter)
      .populate('subjectTests.subjectId', 'nameUzb').lean();

    // Load students: filter by passed IDs, or by variant assignment
    let selectedStudents: any[];
    if (studentIds.length > 0) {
      selectedStudents = await Student.find({ _id: { $in: studentIds } })
        .populate('directionId', 'nameUzb').lean();
    } else {
      // No IDs passed — load only students who have variants for this block test
      const allTestIds = allTests.map(t => t._id);
      const variantDocs = await StudentVariant.find({
        testId: { $in: allTestIds },
        testType: 'BlockTest'
      }).select('studentId').lean();
      const variantStudentIds = [...new Set(variantDocs.map(v => v.studentId.toString()))];
      selectedStudents = await Student.find({ _id: { $in: variantStudentIds } })
        .populate('directionId', 'nameUzb').lean();
    }

    // Calculate totalQuestions: prefer StudentTestConfig, fallback to unique-subject max
    const selectedStudentIds = selectedStudents.map(s => s._id);
    const configs = await StudentTestConfig.find({ studentId: { $in: selectedStudentIds } })
      .select('totalQuestions')
      .lean();

    let totalQuestions: number;
    if (configs.length > 0) {
      totalQuestions = Math.max(...configs.map(c => c.totalQuestions));
    } else {
      // Deduplicate subjects: count max questions per unique subject (ignore letter variants)
      const subjectMax = new Map<string, number>();
      allTests.forEach((t: Record<string, unknown>) => {
        const sts = t.subjectTests as Array<Record<string, unknown>> | undefined;
        sts?.forEach((st) => {
          const sid = (st.subjectId as Record<string, unknown>)?._id?.toString();
          const qLen = (st.questions as Array<unknown>)?.length || 0;
          if (sid) subjectMax.set(sid, Math.max(subjectMax.get(sid) || 0, qLen));
        });
      });
      totalQuestions = Array.from(subjectMax.values()).reduce((sum, q) => sum + q, 0);
    }

    // Load variants for variant codes
    const variants = await StudentVariant.find({
      testType: 'BlockTest',
      studentId: { $in: selectedStudents.map(s => s._id) }
    }).lean();

    const variantMap = new Map<string, string>();
    variants.forEach((v: Record<string, unknown>) => {
      const sid = v.studentId?.toString() || '';
      variantMap.set(sid, (v.variantCode as string) || '');
    });

    const pdfStudents = selectedStudents.map(s => ({
      fullName: (s as Record<string, unknown>).fullName as string || '',
      variantCode: variantMap.get(s._id.toString()) || '',
      studentCode: (s as Record<string, unknown>).studentCode as number | undefined
    }));

    const groupLetter = (selectedStudents[0] as Record<string, unknown>)?.directionId
      ? ((selectedStudents[0] as Record<string, unknown>).directionId as Record<string, unknown>)?.nameUzb
        ? (((selectedStudents[0] as Record<string, unknown>).directionId as Record<string, unknown>).nameUzb as string).charAt(0)
        : 'A'
      : 'A';

    // Collect all subject names
    const subjectNames: string[] = [];
    allTests.forEach((t: Record<string, unknown>) => {
      const subjectTests = t.subjectTests as Array<Record<string, unknown>> | undefined;
      subjectTests?.forEach((st) => {
        const subjectId = st.subjectId as Record<string, unknown> | undefined;
        const name = subjectId?.nameUzb as string | undefined;
        if (name && !subjectNames.includes(name)) {
          subjectNames.push(name);
        }
      });
    });

    const pdfBuffer = await PDFGeneratorService.generateAnswerSheetsPDF({
      students: pdfStudents,
      test: {
        classNumber: blockTest.classNumber,
        groupLetter,
        subjectName: subjectNames.length > 0 ? subjectNames.join(', ') : undefined,
        periodMonth: blockTest.periodMonth,
        periodYear: blockTest.periodYear
      },
      totalQuestions
    });

    const filename = `javob-varaqasi-${blockTest.classNumber}-sinf-${Date.now()}.pdf`;
    const exportsDir = path.join(process.cwd(), 'exports');
    await fs.mkdir(exportsDir, { recursive: true });
    const filePath = path.join(exportsDir, filename);
    await fs.writeFile(filePath, pdfBuffer);

    console.log(`✅ Answer sheets PDF exported: ${pdfStudents.length} students, ${totalQuestions} questions`);
    res.json({ url: `/exports/${filename}`, filename });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('❌ Error exporting answer sheets PDF:', err);
    res.status(500).json({ message: 'Javob varaqasi PDF yaratishda xatolik', error: err.message });
  }
});

// ============================================================================
// ANSWER KEY (TITUL VAROQ) EXPORT FOR BLOCK TESTS
// ============================================================================

/**
 * Export Answer Key as PDF for Block Test
 * GET /block-tests/:id/export-answer-key-pdf
 */
router.get('/:id/export-answer-key-pdf', authenticate, async (req: AuthRequest, res) => {
  try {
    const blockTestId = req.params.id;
    
    // Fetch block test
    const blockTest = await BlockTest.findById(blockTestId)
      .populate('subjectId', 'nameUzb')
      .lean();
    
    if (!blockTest) {
      return res.status(404).json({ message: 'Block test topilmadi' });
    }
    
    // Fetch all variants
    const variants = await StudentVariant.find({ blockTestId })
      .populate('studentId', 'firstName lastName')
      .lean();
    
    if (variants.length === 0) {
      return res.status(400).json({ message: 'Variantlar topilmadi' });
    }
    
    // Generate PDF
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      const filename = `titul-varoq-block-test-${blockTest.classNumber}-${Date.now()}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    });
    
    // Title
    doc.fontSize(16).font('Helvetica-Bold').text(`Block Test ${blockTest.classNumber}-sinf - Titul varoq`, { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(((blockTest as Record<string, unknown>).subjectId as Record<string, unknown>)?.nameUzb as string || '', { align: 'center' });
    doc.moveDown(2);

    // Answer key table
    variants.forEach((variant, vIdx) => {
      if (vIdx > 0 && vIdx % 2 === 0) {
        doc.addPage();
      }

      doc.fontSize(12).font('Helvetica-Bold').text(`Variant ${variant.variantCode} - ${variant.studentId ? `${(variant.studentId as any).firstName} ${(variant.studentId as any).lastName}` : ''}`);
      doc.moveDown(0.5);

      // Answers in grid format (10 per row)
      const answersPerRow = 10;
      let currentRow = '';
      const questions = variant.shuffledQuestions || [];
      questions.forEach((q: any, idx: number) => {
        currentRow += `${idx + 1}.${q.correctAnswer || ''}  `;
        if ((idx + 1) % answersPerRow === 0 || idx === questions.length - 1) {
          doc.fontSize(10).font('Helvetica').text(currentRow);
          currentRow = '';
        }
      });
      
      doc.moveDown(1.5);
    });
    
    doc.end();
    
    console.log('✅ Block test answer key PDF exported');
  } catch (error: any) {
    console.error('❌ Error exporting block test answer key PDF:', error);
    res.status(500).json({ message: 'Titul varoq PDF yaratishda xatolik', error: error.message });
  }
});

/**
 * Export Answer Key as Word for Block Test
 * GET /block-tests/:id/export-answer-key-docx
 */
router.get('/:id/export-answer-key-docx', authenticate, async (req: AuthRequest, res) => {
  try {
    const blockTestId = req.params.id;
    
    // Fetch block test
    const blockTest = await BlockTest.findById(blockTestId)
      .populate('subjectId', 'nameUzb')
      .lean();
    
    if (!blockTest) {
      return res.status(404).json({ message: 'Block test topilmadi' });
    }
    
    // Fetch all variants
    const variants = await StudentVariant.find({ blockTestId })
      .populate('studentId', 'firstName lastName')
      .lean();
    
    if (variants.length === 0) {
      return res.status(400).json({ message: 'Variantlar topilmadi' });
    }
    
    // Create Word document
    const docx = require('docx');
    const { Document, Paragraph, TextRun, AlignmentType } = docx;
    
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // Title
          new Paragraph({
            text: `Block Test ${blockTest.classNumber}-sinf - Titul varoq`,
            heading: 'Heading1',
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: ((blockTest as Record<string, unknown>).subjectId as Record<string, unknown>)?.nameUzb as string || '',
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: '' }),

          // Answer key
          ...variants.flatMap((variant) => {
            const rows: any[] = [];

            // Variant header
            rows.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Variant ${variant.variantCode} - ${variant.studentId ? `${(variant.studentId as any).firstName} ${(variant.studentId as any).lastName}` : ''}`,
                    bold: true,
                  })
                ]
              })
            );

            // Answers (10 per row)
            const answersPerRow = 10;
            let currentRow = '';
            const questions = variant.shuffledQuestions || [];
            questions.forEach((q: any, idx: number) => {
              currentRow += `${idx + 1}.${q.correctAnswer || ''}  `;
              if ((idx + 1) % answersPerRow === 0 || idx === questions.length - 1) {
                rows.push(new Paragraph({ text: currentRow }));
                currentRow = '';
              }
            });
            
            rows.push(new Paragraph({ text: '' }));
            
            return rows;
          })
        ]
      }]
    });
    
    // Generate buffer
    const buffer = await docx.Packer.toBuffer(doc);
    
    const filename = `titul-varoq-block-test-${blockTest.classNumber}-${Date.now()}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
    
    console.log('✅ Block test answer key Word exported');
  } catch (error: any) {
    console.error('❌ Error exporting block test answer key Word:', error);
    res.status(500).json({ message: 'Titul varoq Word yaratishda xatolik', error: error.message });
  }
});


// Generate professional answer sheet HTML for a variant
router.get('/variants/:variantCode/answer-sheet', authenticate, async (req: AuthRequest, res) => {
  try {
    const { variantCode } = req.params;
    
    // Find variant
    const variant = await StudentVariant.findOne({ variantCode })
      .populate('studentId', 'firstName lastName')
      .populate('testId')
      .lean();

    if (!variant) {
      return res.status(404).json({ message: 'Variant topilmadi' });
    }

    const blockTest = (variant as Record<string, unknown>).testId as any;
    const student = variant.studentId as any;
    
    // Read HTML template
    const fs = require('fs').promises;
    const path = require('path');
    const templatePath = path.join(__dirname, '../../templates/answer_sheet_professional.html');
    let html = await fs.readFile(templatePath, 'utf-8');
    
    // Replace placeholders
    html = html.replace(/{{studentName}}/g, `${student.firstName} ${student.lastName}`);
    html = html.replace(/{{subjectName}}/g, blockTest.subjectName || 'Fan');
    html = html.replace(/{{variantCode}}/g, variantCode);
    html = html.replace(/{{className}}/g, `${blockTest.classNumber}-${blockTest.groupLetter}`);
    
    // Return HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error: any) {
    console.error('❌ Answer sheet generation error:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});


