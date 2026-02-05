import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import Student from '../models/Student';
import StudentGroup from '../models/StudentGroup';
import Group from '../models/Group';
import TestResult from '../models/TestResult';
import Direction from '../models/Direction';
import Subject from '../models/Subject';
import { authenticate, AuthRequest } from '../middleware/auth';
import { UserRole } from '../models/User';
import { cacheMiddleware, invalidateCache } from '../middleware/cache';

const router = express.Router();

// Get students by group ID
router.get('/group/:groupId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { groupId } = req.params;
    
    // Check access to group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }
    
    // Check access for teacher
    if (req.user?.role === UserRole.TEACHER) {
      if (!group.teacherId || group.teacherId.toString() !== req.user.teacherId) {
        return res.status(403).json({ message: 'Sizda bu guruh o\'quvchilariga kirish huquqi yo\'q' });
      }
    } else if (req.user?.role === UserRole.FIL_ADMIN) {
      if (group.branchId?.toString() !== req.user.branchId) {
        return res.status(403).json({ message: 'Sizda bu guruh o\'quvchilariga kirish huquqi yo\'q' });
      }
    }
    
    // Get students for group
    const studentGroups = await StudentGroup.find({ groupId })
      .populate({
        path: 'studentId',
        populate: [
          { path: 'directionId' },
          { path: 'subjectIds' },
          { path: 'branchId' }
        ]
      });
    
    const students = studentGroups
      .map(sg => sg.studentId)
      .filter(student => student != null);
    
    console.log('Fetched students for group:', groupId, 'count:', students.length);
    return res.json(students);
  } catch (error: any) {
    console.error('Error fetching students by group:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.get('/', authenticate, cacheMiddleware(120), async (req: AuthRequest, res) => {
  try {
    const { groupId, classNumber } = req.query;
    
    console.log('GET /students - Query params:', { groupId, classNumber, userRole: req.user?.role, teacherId: req.user?.teacherId });
    
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
        if (group.teacherId.toString() !== req.user.teacherId) {
          console.log('Teacher access denied - teacherId mismatch:', {
            groupTeacherId: group.teacherId.toString(),
            userTeacherId: req.user.teacherId
          });
          return res.status(403).json({ message: 'Sizda bu guruh o\'quvchilariga kirish huquqi yo\'q' });
        }
      } else if (req.user?.role === UserRole.FIL_ADMIN) {
        if (group.branchId?.toString() !== req.user.branchId) {
          console.log('Branch admin access denied');
          return res.status(403).json({ message: 'Sizda bu guruh o\'quvchilariga kirish huquqi yo\'q' });
        }
      }
      
      // Get students for group - оптимизированный запрос
      const studentGroups = await StudentGroup.find({ groupId })
        .populate({
          path: 'studentId',
          select: 'fullName classNumber phone directionId subjectIds branchId profileToken',
          populate: [
            { path: 'directionId', select: 'nameUzb nameRu' },
            { path: 'subjectIds', select: 'nameUzb nameRu' },
            { path: 'branchId', select: 'name' }
          ]
        })
        .lean()
        .exec();
      
      console.log('Found StudentGroup records:', studentGroups.length);
      
      const students = studentGroups
        .map(sg => sg.studentId)
        .filter(student => student != null);
      
      console.log('Fetched students for group:', groupId, 'count:', students.length);
      return res.json(students);
    }
    
    // Optimized query for all students
    const filter: any = {};
    if (req.user?.role !== UserRole.SUPER_ADMIN) {
      filter.branchId = req.user?.branchId;
    }
    
    // Filter by class
    if (classNumber) {
      filter.classNumber = parseInt(classNumber as string);
    }
    
    // Скрываем выпускников для всех, кроме админов
    if (req.user?.role !== UserRole.SUPER_ADMIN && req.user?.role !== UserRole.FIL_ADMIN) {
      filter.isGraduated = { $ne: true };
    }
    
    const students = await Student.find(filter)
      .populate('directionId', 'nameUzb nameRu')
      .populate('subjectIds', 'nameUzb nameRu')
      .populate('branchId', 'name')
      .select('fullName classNumber phone directionId subjectIds branchId profileToken createdAt')
      .sort({ fullName: 1 })
      .limit(500)
      .lean()
      .exec();
    
    // Загружаем группы для каждого студента
    const studentsWithGroups = await Promise.all(students.map(async (student: any) => {
      const studentGroups = await StudentGroup.find({ studentId: student._id })
        .populate({
          path: 'groupId',
          select: 'name subjectId classNumber letter',
          populate: {
            path: 'subjectId',
            select: 'nameUzb'
          }
        })
        .lean();
      
      // Фильтруем только валидные группы (где groupId не null)
      const groups = studentGroups
        .filter((sg: any) => sg.groupId != null)
        .map((sg: any) => ({
          _id: sg.groupId._id,
          name: sg.groupId.name,
          subjectId: sg.groupId.subjectId,
          classNumber: sg.groupId.classNumber,
          letter: sg.groupId.letter
        }));
      
      return {
        ...student,
        groups
      };
    }));
    
    res.json(studentsWithGroups);
  } catch (error: any) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    console.log('Creating student:', req.body);
    const { fullName, classNumber, phone, directionId, subjectIds, groups } = req.body;
    
    if (!fullName || !classNumber) {
      return res.status(400).json({ message: 'F.I.Sh va sinf majburiy' });
    }
    
    const profileToken = uuidv4();
    
    const student = new Student({
      branchId: req.user?.branchId,
      fullName,
      classNumber,
      phone: phone || undefined,
      directionId: directionId || undefined,
      subjectIds: subjectIds || [],
      profileToken
    });
    
    await student.save();
    console.log('Student created:', student._id);
    
    if (groups && Array.isArray(groups)) {
      for (const group of groups) {
        if (group.groupId && group.subjectId) {
          await StudentGroup.create({
            studentId: student._id,
            groupId: group.groupId,
            subjectId: group.subjectId
          });
        }
      }
    }
    
    const populatedStudent = await Student.findById(student._id)
      .populate('directionId')
      .populate('subjectIds');
    
    // Инвалидируем кэш студентов
    await invalidateCache('/api/students');
    
    res.status(201).json({
      student: populatedStudent,
      profileUrl: `/p/${profileToken}`
    });
  } catch (error: any) {
    console.error('Error creating student:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
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
      await StudentGroup.deleteMany({ studentId: student._id });
      
      // Добавляем новые
      if (groups.length > 0) {
        const studentGroups = groups.map((g: any) => ({
          studentId: student._id,
          groupId: g.groupId,
          subjectId: g.subjectId
        }));
        await StudentGroup.insertMany(studentGroups);
      }
    }
    
    // Инвалидируем кэш студентов
    await invalidateCache('/api/students');
    
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
    
    // Get test results
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
    
    // Calculate statistics
    const completedTests = testResults.length;
    const avgPercentage = completedTests > 0
      ? Math.round(testResults.reduce((sum: number, r: any) => sum + (r.percentage || 0), 0) / completedTests)
      : 0;
    
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
    
    // Инвалидируем кэш студентов
    await invalidateCache('/api/students');
    
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
    direction.subjects.forEach((subjectChoice: any) => {
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

// Bulk import students from Excel
router.post('/bulk-import', authenticate, async (req: AuthRequest, res) => {
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
    direction.subjects.forEach((subjectChoice: any) => {
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
        
        // Check if student with this phone already exists
        if (normalizedPhone) {
          const existingStudent = await Student.findOne({ phone: normalizedPhone });
          if (existingStudent) {
            results.skipped.push({
              row: rowNumber,
              name: fullName,
              reason: 'Telefon raqami allaqachon mavjud'
            });
            continue;
          }
        }
        
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
        
        // Create student
        const profileToken = uuidv4();
        const student = new Student({
          branchId: req.user?.branchId,
          fullName,
          classNumber,
          phone: normalizedPhone,
          directionId,
          subjectIds: allSubjects.map(s => s._id),
          profileToken
        });
        
        await student.save();
        console.log(`Created student: ${fullName} (${student._id})`);
        
        // Create or find groups and assign student
        for (const assignment of groupAssignments) {
          const subject = allSubjects.find(s => s._id.toString() === assignment.subjectId);
          if (!subject) continue;
          
          // Find or create group
          let group = await Group.findOne({
            branchId: req.user?.branchId,
            classNumber,
            subjectId: assignment.subjectId,
            letter: assignment.letter
          });
          
          if (!group) {
            // Create new group
            const groupName = `${classNumber}-${assignment.letter} ${subject.nameUzb}`;
            group = new Group({
              branchId: req.user?.branchId,
              name: groupName,
              classNumber,
              subjectId: assignment.subjectId,
              letter: assignment.letter,
              capacity: 20
            });
            await group.save();
            console.log(`Created new group: ${groupName} (${group._id})`);
          } else {
            console.log(`Using existing group: ${group.name} (${group._id})`);
          }
          
          // Assign student to group
          await StudentGroup.create({
            studentId: student._id,
            groupId: group._id,
            subjectId: assignment.subjectId
          });
          console.log(`Assigned student ${student._id} to group ${group._id}`);
        }
        
        results.success.push({
          row: rowNumber,
          name: fullName,
          profileUrl: `/p/${profileToken}`
        });
        
      } catch (error: any) {
        console.error(`Error processing row ${rowNumber}:`, error);
        results.errors.push({
          row: rowNumber,
          name: row['F.I.Sh'] || 'N/A',
          error: error.message
        });
      }
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
