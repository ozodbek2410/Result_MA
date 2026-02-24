import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import Student from '../models/Student';
import StudentGroup from '../models/StudentGroup';
import Group from '../models/Group';
import TestResult from '../models/TestResult';
import Direction from '../models/Direction';
import Subject from '../models/Subject';
import Branch from '../models/Branch';
import { authenticate, AuthRequest } from '../middleware/auth';
import { UserRole } from '../models/User';
import { cacheMiddleware, invalidateCache } from '../middleware/cache';
import { cacheService, CacheTTL, CacheInvalidation } from '../utils/cache';

const router = express.Router();

// Get students by group ID
router.get('/group/:groupId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { groupId } = req.params;
    
    // Check cache first
    const cacheKey = `students:group:${groupId}`;
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    // Check access to group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }
    
    // Check access for teacher
    if (req.user?.role === UserRole.TEACHER) {
      if (!group.teacherId || group.teacherId.toString() !== req.user.id) {
        return res.status(403).json({ message: 'Sizda bu guruh o\'quvchilariga kirish huquqi yo\'q' });
      }
    } else if (req.user?.role === UserRole.FIL_ADMIN) {
      if (group.branchId?.toString() !== req.user.branchId) {
        return res.status(403).json({ message: 'Sizda bu guruh o\'quvchilariga kirish huquqi yo\'q' });
      }
    }

    // ОПТИМИЗАЦИЯ: Минимальная загрузка - только имя и ID
    const studentGroups = await StudentGroup.find({ groupId })
      .populate({
        path: 'studentId',
        select: 'fullName _id profileToken'  // Только основные поля
      })
      .lean();
    
    const students = studentGroups
      .map(sg => sg.studentId)
      .filter(student => student != null);
    
    console.log('Fetched students for group (minimal):', groupId, 'count:', students.length);
    
    // Cache the result
    cacheService.set(cacheKey, students, CacheTTL.LIST);
    
    return res.json(students);
  } catch (error: any) {
    console.error('Error fetching students by group:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { groupId, classNumber, page = '1', limit = '500' } = req.query;
    
    console.log('GET /students - Query params:', { groupId, classNumber, page, limit, userRole: req.user?.role, teacherId: req.user?.teacherId });
    
    // Check cache first
    const cacheKey = `students:${req.user?.branchId || 'all'}:${groupId || 'all'}:${classNumber || 'all'}:${page}:${limit}`;
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    // If requesting students for specific group
    if (groupId) {
      // Check access to group
      const group = await Group.findById(groupId).select('teacherId branchId').lean();
      if (!group) {
        console.log('Group not found:', groupId);
        return res.status(404).json({ message: 'Guruh topilmadi' });
      }
      
      console.log('Found group:', { 
        groupId, 
        teacherId: group.teacherId?.toString(), 
        branchId: group.branchId?.toString(),
        userTeacherId: req.user?.teacherId,
        userBranchId: req.user?.branchId
      });
      
      // Check access for teacher
      if (req.user?.role === UserRole.TEACHER) {
        if (!group.teacherId) {
          console.log('Group has no teacher assigned');
          return res.status(403).json({ message: 'Bu guruhga o\'qituvchi tayinlanmagan' });
        }
        if (group.teacherId.toString() !== req.user.id) {
          console.log('Teacher access denied - teacherId mismatch:', {
            groupTeacherId: group.teacherId.toString(),
            userTeacherId: req.user.id
          });
          return res.status(403).json({ message: 'Sizda bu guruh o\'quvchilariga kirish huquqi yo\'q' });
        }
      } else if (req.user?.role === UserRole.FIL_ADMIN) {
        if (group.branchId?.toString() !== req.user.branchId) {
          console.log('Branch admin access denied');
          return res.status(403).json({ message: 'Sizda bu guruh o\'quvchilariga kirish huquqi yo\'q' });
        }
      }
      
      // Get students for group - МИНИМАЛЬНАЯ ЗАГРУЗКА
      const studentGroups = await StudentGroup.find({ groupId })
        .populate({
          path: 'studentId',
          select: 'fullName _id profileToken phone'  // Добавлено поле phone
        })
        .lean()
        .exec();
      
      console.log('Found StudentGroup records (minimal):', studentGroups.length);
      
      const students = studentGroups
        .map(sg => sg.studentId)
        .filter(student => student != null);
      
      console.log('Fetched students for group (minimal):', groupId, 'count:', students.length);
      
      // Cache the result
      cacheService.set(cacheKey, students, CacheTTL.LIST);
      
      return res.json(students);
    }
    
    // Optimized query for all students with pagination
    const filter: any = {};
    if (req.user?.role !== UserRole.SUPER_ADMIN) {
      filter.branchId = req.user?.branchId;
    }
    
    // Filter by class with validation
    if (classNumber) {
      const parsedClass = parseInt(classNumber as string);
      if (!isNaN(parsedClass) && parsedClass > 0 && parsedClass <= 12) {
        filter.classNumber = parsedClass;
      } else {
        return res.status(400).json({ message: 'Noto\'g\'ri sinf raqami' });
      }
    }
    
    // Скрываем выпускников для всех, кроме админов
    if (req.user?.role !== UserRole.SUPER_ADMIN && req.user?.role !== UserRole.FIL_ADMIN) {
      filter.isGraduated = { $ne: true };
    }
    
    // Pagination parameters with validation
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit as string) || 500));
    const skip = (pageNum - 1) * limitNum;
    
    const students = await Student.find(filter)
      .select('fullName classNumber phone directionId branchId _id profileToken subjectIds')
      .populate('directionId', 'nameUzb')
      .populate('branchId', 'name')
      .populate('subjectIds', 'nameUzb')
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean()
      .exec();
    
    // Получаем группы студентов через StudentGroup
    const studentIds = students.map((s: any) => s._id);
    const studentGroups = await StudentGroup.find({ 
      studentId: { $in: studentIds } 
    })
      .populate('groupId', 'name letter classNumber')
      .lean();
    
    // Создаем Map: studentId -> group
    const studentGroupMap = new Map();
    studentGroups.forEach((sg: any) => {
      studentGroupMap.set(sg.studentId.toString(), sg.groupId);
    });
    
    // Return students with all necessary fields for display including group info
    const studentsWithDetails = students.map((student: any) => {
      const group = studentGroupMap.get(student._id.toString());
      return {
        _id: student._id,
        fullName: student.fullName,
        classNumber: student.classNumber,
        phone: student.phone,
        profileToken: student.profileToken,
        directionId: student.directionId,
        branchId: student.branchId,
        subjectIds: student.subjectIds,
        groupId: group || null, // Добавляем информацию о группе
        groupLetter: group?.letter || null // Добавляем букву группы
      };
    });
    
    // Cache the result
    cacheService.set(cacheKey, studentsWithDetails, CacheTTL.LIST);
    
    res.json(studentsWithDetails);
  } catch (error: any) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// CRM-managed: student CRUD disabled
const CRM_MSG = 'Bu ma\'lumot CRM orqali boshqariladi';

router.post('/', authenticate, async (req: AuthRequest, res) => {
  return res.status(403).json({ message: CRM_MSG });
  try {
    console.log('Creating student:', req.body);
    const { fullName, classNumber, phone, directionId, subjectIds, groups, isYoungStudent } = req.body;
    
    if (!fullName || !classNumber) {
      return res.status(400).json({ message: 'F.I.Sh va sinf majburiy' });
    }
    
    const profileToken = uuidv4();
    
    // For young students (< 7), directionId is not required
    const studentData: any = {
      branchId: req.user?.branchId,
      fullName,
      classNumber,
      phone: phone || undefined,
      profileToken
    };
    
    // Only add directionId for older students
    if (classNumber >= 7 && directionId) {
      studentData.directionId = directionId;
      studentData.subjectIds = subjectIds || [];
    } else if (classNumber < 7) {
      // For young students, collect subjects from their groups
      studentData.subjectIds = [];
    }
    
    const student = new Student(studentData);
    await student.save();
    console.log('✅ Student created:', student._id);
    
    // Handle group assignments
    if (groups && Array.isArray(groups) && groups.length > 0) {
      // User manually selected groups
      for (const group of groups) {
        if (group.groupId && group.subjectId) {
          await StudentGroup.create({
            studentId: student._id,
            groupId: group.groupId,
            subjectId: group.subjectId
          });
        }
      }
      console.log(`✅ Added student to ${groups.length} manually selected groups`);
    } else if (classNumber < 7) {
      // For young students without manual selection, add to all class groups
      const classGroups = await Group.find({
        branchId: req.user?.branchId,
        classNumber: classNumber
      }).lean();
      
      console.log(`🔍 Found ${classGroups.length} groups for class ${classNumber}`);
      
      if (classGroups.length > 0) {
        const studentGroups = classGroups.map(g => ({
          studentId: student._id,
          groupId: g._id,
          subjectId: g.subjectId
        }));
        
        await StudentGroup.insertMany(studentGroups);
        
        // Update student's subjectIds
        const uniqueSubjectIds = [...new Set(classGroups.map(g => g.subjectId!.toString()))];
        student.subjectIds = uniqueSubjectIds as any;
        await student.save();
        
        console.log(`✅ Auto-added young student to all ${classGroups.length} class groups`);
      } else {
        console.log(`⚠️ No groups found for class ${classNumber}, student created without groups`);
      }
    }
    
    const populatedStudent = await Student.findById(student._id)
      .populate('directionId')
      .populate('subjectIds');
    
    // Инвалидируем кэш студентов и групп
    CacheInvalidation.onStudentChange();
    await Promise.all([
      invalidateCache('/api/students'),
      invalidateCache('/api/groups')
    ]);
    
    res.status(201).json({
      student: populatedStudent,
      profileUrl: `/p/${profileToken}`
    });
  } catch (error: any) {
    console.error('❌ Error creating student:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  return res.status(403).json({ message: CRM_MSG });
  try {
    const { groups, ...updateData } = req.body;
    
    const student = await Student.findByIdAndUpdate(req.params.id, updateData, { new: true })
      .populate('directionId')
      .populate('subjectIds');
    
    if (!student) {
      return res.status(404).json({ message: 'O\'quvchi topilmadi' });
    }
    
    // Обновляем группы студента
    if (groups && Array.isArray(groups)) {
      // Удаляем старые связи
      await StudentGroup.deleteMany({ studentId: student!._id });

      // Добавляем новые
      if (groups.length > 0) {
        const studentGroups = groups.map((g: any) => ({
          studentId: student!._id,
          groupId: g.groupId,
          subjectId: g.subjectId
        }));
        await StudentGroup.insertMany(studentGroups);
      }
    }
    
    // Инвалидируем кэш студентов и групп
    CacheInvalidation.onStudentChange();
    await Promise.all([
      invalidateCache('/api/students'),
      invalidateCache('/api/groups')
    ]);
    
    res.json(student);
  } catch (error: any) {
    console.error('Error updating student:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Get student profile with groups and tests
router.get('/:id/profile', authenticate, async (req: AuthRequest, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('branchId', 'name')
      .populate('directionId', 'nameUzb')
      .populate('subjectIds', 'nameUzb')
      .select('+grades')  // Include grades field
      .lean();
    
    if (!student) {
      return res.status(404).json({ message: 'O\'quvchi topilmadi' });
    }
    
    // Check access
    if (req.user?.role !== UserRole.SUPER_ADMIN && student.branchId?._id?.toString() !== req.user?.branchId?.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Get student groups
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
    
    // Get test results (old system)
    const testResults = await TestResult.find({ studentId: student._id })
      .populate('testId', 'name')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    const recentTests = testResults.map((result: any) => ({
      _id: result._id,
      testName: result.testId?.name || 'Test',
      score: result.totalPoints || 0,
      maxScore: result.maxPoints || 0,
      percentage: result.percentage || 0,
      createdAt: result.createdAt
    }));
    
    // Calculate statistics - COMBINE ALL SOURCES
    const allScores: number[] = [];
    
    // Add TestResults (old system)
    testResults.forEach((r: any) => {
      if (r.percentage) allScores.push(r.percentage);
    });
    
    // Add Student.grades (new system - from Assignments)
    if (student.grades && student.grades.length > 0) {
      student.grades.forEach((g: any) => {
        if (g.percentage) allScores.push(g.percentage);
      });
    }
    
    const completedTests = allScores.length;
    const avgPercentage = completedTests > 0
      ? Math.round(allScores.reduce((sum, p) => sum + p, 0) / completedTests)
      : 0;
    
    console.log(`📊 Student ${student.fullName}: ${completedTests} total scores, avg: ${avgPercentage}%`);
    
    res.json({
      ...student,
      groups,
      groupsCount: groups.length,
      recentTests,
      completedTests,
      avgPercentage
    });
  } catch (error: any) {
    console.error('Error fetching student profile:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  return res.status(403).json({ message: CRM_MSG });
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'O\'quvchi topilmadi' });
    }
    
    // Каскадное удаление связанных данных
    const studentId = req.params.id;
    
    // Удаляем результаты тестов студента
    const TestResult = require('../models/TestResult').default;
    await TestResult.deleteMany({ studentId });
    
    // Удаляем конфигурации тестов студента
    const StudentTestConfig = require('../models/StudentTestConfig').default;
    await StudentTestConfig.deleteMany({ studentId });
    
    // Удаляем варианты студента
    const StudentVariant = require('../models/StudentVariant').default;
    await StudentVariant.deleteMany({ studentId });
    
    // Удаляем связи студента с группами
    await StudentGroup.deleteMany({ studentId });
    
    // Удаляем логи активности студента
    const StudentActivityLog = require('../models/StudentActivityLog').default;
    await StudentActivityLog.deleteMany({ studentId });
    
    // Удаляем самого студента
    await Student.findByIdAndDelete(req.params.id);
    
    // Инвалидируем кэш студентов и групп
    CacheInvalidation.onStudentChange();
    await Promise.all([
      invalidateCache('/api/students'),
      invalidateCache('/api/groups')
    ]);
    
    res.json({ message: 'O\'quvchi va unga tegishli barcha ma\'lumotlar o\'chirildi' });
  } catch (error: any) {
    console.error('Error deleting student:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Download Excel template for bulk import
router.get('/download-template/:directionId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { directionId } = req.params;
    
    // Get direction with subjects
    const direction = await Direction.findById(directionId).populate('subjects.subjectIds');
    if (!direction) {
      return res.status(404).json({ message: 'Yo\'nalish topilmadi' });
    }
    
    // Collect all subjects for this direction
    const subjectIds = new Set<string>();
    direction!.subjects.forEach((subjectChoice: any) => {
      subjectChoice.subjectIds.forEach((subjectId: any) => {
        subjectIds.add(subjectId._id.toString());
      });
    });
    
    // Get direction subjects
    const directionSubjects = await Subject.find({ _id: { $in: Array.from(subjectIds) } });
    
    // Get mandatory subjects (that are not in direction)
    const mandatorySubjects = await Subject.find({ 
      isMandatory: true,
      _id: { $nin: Array.from(subjectIds) }
    });
    
    // Combine all subjects
    const allSubjects = [...directionSubjects, ...mandatorySubjects];
    
    // Create Excel workbook
    const wb = XLSX.utils.book_new();
    
    // Create header row
    const headers = ['F.I.Sh', 'Telefon', 'Sinf'];
    allSubjects.forEach(subject => {
      headers.push(subject.nameUzb);
    });
    
    // Create example data
    const exampleData = [
      {
        'F.I.Sh': 'Ravshanov Yuxanno',
        'Telefon': '+998332395010',
        'Sinf': 7,
        ...Object.fromEntries(allSubjects.map(s => [s.nameUzb, 'A']))
      },
      {
        'F.I.Sh': 'Karimova Dilnoza',
        'Telefon': '+998901234567',
        'Sinf': 7,
        ...Object.fromEntries(allSubjects.map(s => [s.nameUzb, 'B']))
      },
      {
        'F.I.Sh': '',
        'Telefon': '',
        'Sinf': '',
        ...Object.fromEntries(allSubjects.map(s => [s.nameUzb, '']))
      }
    ];
    
    const ws = XLSX.utils.json_to_sheet(exampleData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 25 }, // F.I.Sh
      { wch: 20 }, // Telefon
      { wch: 8 },  // Sinf
      ...allSubjects.map(() => ({ wch: 15 }))
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, direction.nameUzb);
    
    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    // Send file
    res.setHeader('Content-Disposition', `attachment; filename="student_import_${direction.nameUzb}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error: any) {
    console.error('Error generating template:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Helper function to normalize phone number
function normalizePhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 0) return undefined;
  // Ensure it starts with +998
  if (cleaned.startsWith('998')) {
    return '+' + cleaned;
  }
  return '+998' + cleaned;
}

// Bulk import students from Excel (CRM-managed)
router.post('/bulk-import', authenticate, async (req: AuthRequest, res) => {
  return res.status(403).json({ message: CRM_MSG });
  try {
    const { directionId, fileData } = req.body;
    
    if (!directionId || !fileData) {
      return res.status(400).json({ message: 'Yo\'nalish va fayl ma\'lumotlari majburiy' });
    }
    
    // Get direction with subjects
    const direction = await Direction.findById(directionId).populate('subjects.subjectIds');
    if (!direction) {
      return res.status(404).json({ message: 'Yo\'nalish topilmadi' });
    }
    
    // Collect all subjects for this direction
    const subjectIds = new Set<string>();
    direction!.subjects.forEach((subjectChoice: any) => {
      subjectChoice.subjectIds.forEach((subjectId: any) => {
        subjectIds.add(subjectId._id.toString());
      });
    });
    
    // Get direction subjects
    const directionSubjects = await Subject.find({ _id: { $in: Array.from(subjectIds) } });
    
    // Get mandatory subjects (that are not in direction)
    const mandatorySubjects = await Subject.find({ 
      isMandatory: true,
      _id: { $nin: Array.from(subjectIds) }
    });
    
    // Combine all subjects
    const allSubjects = [...directionSubjects, ...mandatorySubjects];
    const subjectMap = new Map(allSubjects.map(s => [s.nameUzb, s]));
    
    console.log('All subjects for import:', allSubjects.map(s => s.nameUzb));
    
    // Parse Excel file
    const buffer = Buffer.from(fileData, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    if (data.length === 0) {
      return res.status(400).json({ message: 'Excel fayl bo\'sh' });
    }
    
    const results = {
      success: [] as any[],
      skipped: [] as any[],
      errors: [] as any[]
    };
    
    // Collect all students to create in batch
    const studentsToCreate: any[] = [];
    const studentGroupsToCreate: any[] = [];
    const groupsCache = new Map<string, any>(); // Cache for groups
    
    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row: any = data[i];
      const rowNumber = i + 2; // Excel row number (1-indexed + header)
      
      try {
        const fullName = row['F.I.Sh']?.toString().trim();
        const phone = row['Telefon']?.toString().trim();
        const classNumber = parseInt(row['Sinf']);
        
        // Validate required fields
        if (!fullName || !classNumber) {
          results.errors.push({
            row: rowNumber,
            name: fullName || 'N/A',
            error: 'F.I.Sh va Sinf majburiy'
          });
          continue;
        }
        
        // Normalize phone
        const normalizedPhone = normalizePhone(phone);
        
        // Validate and collect groups
        const groupAssignments: Array<{ subjectId: string; subjectName: string; letter: string }> = [];
        
        for (const subject of allSubjects) {
          const groupLetter = row[subject.nameUzb]?.toString().trim().toUpperCase();
          
          if (!groupLetter) {
            results.errors.push({
              row: rowNumber,
              name: fullName,
              error: `${subject.nameUzb} uchun guruh harfi ko'rsatilmagan`
            });
            break;
          }
          
          groupAssignments.push({
            subjectId: subject._id.toString(),
            subjectName: subject.nameUzb,
            letter: groupLetter
          });
        }
        
        // Check for validation errors
        const rowErrors = results.errors.filter(e => e.row === rowNumber);
        if (rowErrors.length > 0) {
          continue;
        }
        
        // Prepare student data
        const profileToken = uuidv4();
        const studentData = {
          branchId: req.user?.branchId,
          fullName,
          classNumber,
          phone: normalizedPhone,
          directionId,
          subjectIds: allSubjects.map(s => s._id),
          profileToken,
          rowNumber,
          groupAssignments
        };
        
        studentsToCreate.push(studentData);
        
      } catch (error: any) {
        console.error(`Error processing row ${rowNumber}:`, error);
        results.errors.push({
          row: rowNumber,
          name: row['F.I.Sh'] || 'N/A',
          error: error.message
        });
      }
    }
    
    // Batch create students
    console.log(`Creating ${studentsToCreate.length} students in batch...`);
    
    for (const studentData of studentsToCreate) {
      try {
        const { rowNumber, groupAssignments, ...studentFields } = studentData;
        
        // Create student
        const student = new Student(studentFields);
        await student.save();
        console.log(`Created student: ${student.fullName} (${student._id})`);
        
        // Create or find groups and assign student
        for (const assignment of groupAssignments) {
          const subject = allSubjects.find(s => s._id.toString() === assignment.subjectId);
          if (!subject) continue;
          
          // Use cache key for group lookup
          const groupKey = `${req.user?.branchId}_${studentFields.classNumber}_${assignment.subjectId}_${assignment.letter}`;
          
          let group = groupsCache.get(groupKey);
          
          if (!group) {
            // Find or create group
            group = await Group.findOne({
              branchId: req.user?.branchId,
              classNumber: studentFields.classNumber,
              subjectId: assignment.subjectId,
              letter: assignment.letter
            });
            
            if (!group) {
              // Create new group
              const groupName = `${studentFields.classNumber}-${assignment.letter} ${subject?.nameUzb ?? ''}`;
              group = new Group({
                branchId: req.user?.branchId,
                name: groupName,
                classNumber: studentFields.classNumber,
                subjectId: assignment.subjectId,
                letter: assignment.letter,
                capacity: 20
              });
              await group.save();
              console.log(`Created new group: ${groupName} (${group._id})`);
            }
            
            // Cache the group
            groupsCache.set(groupKey, group);
          }
          
          // Prepare student-group assignment
          studentGroupsToCreate.push({
            studentId: student._id,
            groupId: group._id,
            subjectId: assignment.subjectId
          });
        }
        
        results.success.push({
          row: rowNumber,
          name: student.fullName,
          profileUrl: `/p/${student.profileToken}`
        });
        
      } catch (error: any) {
        console.error(`Error creating student:`, error);
        results.errors.push({
          row: studentData.rowNumber,
          name: studentData.fullName,
          error: error.message
        });
      }
    }
    
    // Batch insert student-group assignments
    if (studentGroupsToCreate.length > 0) {
      console.log(`Creating ${studentGroupsToCreate.length} student-group assignments in batch...`);
      await StudentGroup.insertMany(studentGroupsToCreate);
    }
    
    console.log('Import completed:', {
      total: data.length,
      success: results.success.length,
      skipped: results.skipped.length,
      errors: results.errors.length
    });
    
    res.json({
      message: 'Import yakunlandi',
      total: data.length,
      successCount: results.success.length,
      skippedCount: results.skipped.length,
      errorCount: results.errors.length,
      results
    });
    
  } catch (error: any) {
    console.error('Error importing students:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

export default router;
