import express from 'express';
import ExcelJS from 'exceljs';
import { authenticate, AuthRequest } from '../middleware/auth';
import TestResult from '../models/TestResult';
import Test from '../models/Test';
import BlockTest from '../models/BlockTest';
import { cacheService, CacheTTL, CacheInvalidation } from '../utils/cache';

const router = express.Router();

// Get all test results
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const filter: any = {};
    
    // Если не Super Admin, показываем только результаты своего филиала
    if (req.user?.role !== 'SUPER_ADMIN') {
      filter.branchId = req.user?.branchId;
    }
    
    // Check cache
    const cacheKey = `testResults:all:${req.user?.branchId || 'all'}`;
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    const testResults = await TestResult.find(filter)
      .populate('studentId')
      .populate('testId')
      .populate('blockTestId')
      .sort({ createdAt: -1 })
      .lean();
    
    // Cache the result
    cacheService.set(cacheKey, testResults, CacheTTL.STATISTICS);
    
    res.json(testResults);
  } catch (error: any) {
    console.error('Error fetching test results:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Get test result by ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    // Check cache
    const cacheKey = `testResults:id:${req.params.id}`;
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    const testResult = await TestResult.findById(req.params.id)
      .populate('studentId')
      .populate('testId')
      .populate('blockTestId')
      .lean();
    
    if (!testResult) {
      return res.status(404).json({ message: 'Test natijasi topilmadi' });
    }
    
    // Проверка доступа
    if (req.user?.role !== 'SUPER_ADMIN' && testResult.branchId?.toString() !== req.user?.branchId?.toString()) {
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }
    
    // Cache the result
    cacheService.set(cacheKey, testResult, CacheTTL.STATISTICS);
    
    res.json(testResult);
  } catch (error: any) {
    console.error('Error fetching test result:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Get test results by student
router.get('/student/:studentId', authenticate, async (req: AuthRequest, res) => {
  try {
    const filter: any = { studentId: req.params.studentId };
    
    // Если не Super Admin, показываем только результаты своего филиала
    if (req.user?.role !== 'SUPER_ADMIN') {
      filter.branchId = req.user?.branchId;
    }
    
    // Check cache
    const cacheKey = `testResults:student:${req.params.studentId}:${req.user?.branchId || 'all'}`;
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    const testResults = await TestResult.find(filter)
      .populate('testId')
      .populate('blockTestId')
      .sort({ createdAt: -1 })
      .lean();
    
    // Cache the result
    cacheService.set(cacheKey, testResults, CacheTTL.STATISTICS);
    
    res.json(testResults);
  } catch (error: any) {
    console.error('Error fetching student test results:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Get test results by test
router.get('/test/:testId', authenticate, async (req: AuthRequest, res) => {
  try {
    const filter: any = { testId: req.params.testId };
    
    // Если не Super Admin, показываем только результаты своего филиала
    if (req.user?.role !== 'SUPER_ADMIN') {
      filter.branchId = req.user?.branchId;
    }
    
    // Check cache
    const cacheKey = `testResults:test:${req.params.testId}:${req.user?.branchId || 'all'}`;
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    const testResults = await TestResult.find(filter)
      .populate('studentId')
      .sort({ createdAt: -1 })
      .lean();
    
    // Cache the result
    cacheService.set(cacheKey, testResults, CacheTTL.STATISTICS);
    
    res.json(testResults);
  } catch (error: any) {
    console.error('Error fetching test results:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Create test result
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const testResultData = {
      ...req.body,
      branchId: req.user?.branchId
    };
    
    const testResult = new TestResult(testResultData);
    await testResult.save();
    
    const populatedResult = await TestResult.findById(testResult._id)
      .populate('studentId')
      .populate('testId')
      .populate('blockTestId');
    
    res.status(201).json(populatedResult);
  } catch (error: any) {
    console.error('Error creating test result:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Update test result
router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const testResult = await TestResult.findById(req.params.id);
    
    if (!testResult) {
      return res.status(404).json({ message: 'Test natijasi topilmadi' });
    }
    
    // Проверка доступа
    if (req.user?.role !== 'SUPER_ADMIN' && testResult.branchId?.toString() !== req.user?.branchId?.toString()) {
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }
    
    Object.assign(testResult, req.body);
    await testResult.save();
    
    const populatedResult = await TestResult.findById(testResult._id)
      .populate('studentId')
      .populate('testId')
      .populate('blockTestId');
    
    res.json(populatedResult);
  } catch (error: any) {
    console.error('Error updating test result:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Delete test result
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const testResult = await TestResult.findById(req.params.id);
    
    if (!testResult) {
      return res.status(404).json({ message: 'Test natijasi topilmadi' });
    }
    
    // Проверка доступа
    if (req.user?.role !== 'SUPER_ADMIN' && testResult.branchId?.toString() !== req.user?.branchId?.toString()) {
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }
    
    await TestResult.findByIdAndDelete(req.params.id);
    res.json({ message: 'Test natijasi o\'chirildi' });
  } catch (error: any) {
    console.error('Error deleting test result:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Export test results to Excel (green styled)
router.get('/export/test/:testId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { testId } = req.params;
    const filter: Record<string, unknown> = {};

    let testName = 'Test natijalar';
    let maxQuestions = 0;
    const bt = await BlockTest.findById(testId).lean();
    if (bt) {
      filter.blockTestId = testId;
      testName = `Blok test ${bt.periodMonth || ''}/${bt.periodYear || ''} ${bt.classNumber || ''}-sinf`;
      maxQuestions = bt.subjectTests?.reduce((sum: number, st: any) => sum + (st.questions?.length || 0), 0) || 0;
    } else {
      const t = await Test.findById(testId).lean();
      if (t) {
        filter.testId = testId;
        testName = t.name || 'Test natijalar';
        maxQuestions = t.questions?.length || 0;
      } else {
        return res.status(404).json({ message: 'Test topilmadi' });
      }
    }

    if (req.user?.role !== 'SUPER_ADMIN') {
      filter.branchId = req.user?.branchId;
    }

    const results = await TestResult.find(filter)
      .populate('studentId', 'fullName')
      .sort({ totalPoints: -1 })
      .lean();

    if (!results.length) {
      return res.status(404).json({ message: 'Natijalar topilmadi' });
    }

    if (!maxQuestions) maxQuestions = results[0]?.maxPoints || results[0]?.answers?.length || 0;

    // Build styled Excel with exceljs
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Natijalar');

    // Column config
    ws.columns = [
      { key: 'num', width: 5 },
      { key: 'name', width: 38 },
      { key: 'score', width: 18 },
    ];

    const greenFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3CB371' } };
    const darkGreenFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E8B57' } };
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    const bodyFont: Partial<ExcelJS.Font> = { size: 11 };
    const border: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FF1A7340' } },
      left: { style: 'thin', color: { argb: 'FF1A7340' } },
      bottom: { style: 'thin', color: { argb: 'FF1A7340' } },
      right: { style: 'thin', color: { argb: 'FF1A7340' } },
    };

    // Header row
    const headerRow = ws.addRow(['', "O'quvchilarning ism familiyasi", `Test soni: ${maxQuestions}`]);
    headerRow.eachCell((cell) => {
      cell.fill = darkGreenFill;
      cell.font = headerFont;
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    headerRow.height = 28;

    // Data rows
    results.forEach((r: any, i: number) => {
      const row = ws.addRow([
        i + 1,
        r.studentId?.fullName || "Noma'lum",
        r.totalPoints ?? 0,
      ]);
      row.eachCell((cell) => {
        cell.fill = greenFill;
        cell.font = bodyFont;
        cell.border = border;
        cell.alignment = { vertical: 'middle' };
      });
      // Name left-aligned, number and score centered
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
      row.height = 22;
    });

    const buffer = await wb.xlsx.writeBuffer();
    const fileName = encodeURIComponent(testName.replace(/[/\\?%*:|"<>]/g, '_'));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.xml');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error('Error exporting results:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

export default router;
