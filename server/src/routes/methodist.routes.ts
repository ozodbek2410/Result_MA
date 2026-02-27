import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { UserRole } from '../models/User';
import Test from '../models/Test';
import BlockTest from '../models/BlockTest';
import Subject from '../models/Subject';

const router = express.Router();

/**
 * Роуты для роли METHODIST
 * Методист может создавать и редактировать тесты и блок-тесты
 */

// ============= ТЕСТЫ =============

// Получить все тесты
router.get('/tests', authenticate, requirePermission('view_tests'), async (req: AuthRequest, res) => {
  try {
    const filter: any = {};
    
    // Методист видит только свои тесты
    if (req.user?.role === UserRole.METHODIST && req.user) {
      filter.createdBy = req.user.id;
    }
    
    const tests = await Test.find(filter)
      .populate('subjectId')
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 })
      .lean();
    
    res.json(tests);
  } catch (error: any) {
    console.error('Error fetching tests:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Получить тест по ID
router.get('/tests/:id', authenticate, requirePermission('view_tests'), async (req: AuthRequest, res) => {
  try {
    const test = await Test.findById(req.params.id)
      .populate('subjectId')
      .populate('createdBy', 'username')
      .lean();
    
    if (!test) {
      return res.status(404).json({ message: 'Test topilmadi' });
    }
    
    // Методист может видеть только свои тесты
    if (req.user?.role === UserRole.METHODIST && req.user && test.createdBy?._id?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    res.json(test);
  } catch (error: any) {
    console.error('Error fetching test:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Создать тест
router.post('/tests', authenticate, requirePermission('create_tests'), async (req: AuthRequest, res) => {
  try {
    const testData = {
      ...req.body,
      createdBy: req.user?.id
    };
    
    const test = new Test(testData);
    await test.save();
    
    const populatedTest = await Test.findById(test._id)
      .populate('subjectId')
      .populate('createdBy', 'username');
    
    res.status(201).json(populatedTest);
  } catch (error: any) {
    console.error('Error creating test:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Обновить тест
router.put('/tests/:id', authenticate, requirePermission('edit_tests'), async (req: AuthRequest, res) => {
  try {
    const test = await Test.findById(req.params.id);
    
    if (!test) {
      return res.status(404).json({ message: 'Test topilmadi' });
    }
    
    // Методист может редактировать только свои тесты
    if (req.user?.role === UserRole.METHODIST && req.user && test.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    Object.assign(test, req.body);
    await test.save();
    
    const populatedTest = await Test.findById(test._id)
      .populate('subjectId')
      .populate('createdBy', 'username');
    
    res.json(populatedTest);
  } catch (error: any) {
    console.error('Error updating test:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Удалить тест
router.delete('/tests/:id', authenticate, requirePermission('delete_tests'), async (req: AuthRequest, res) => {
  try {
    const test = await Test.findById(req.params.id);
    
    if (!test) {
      return res.status(404).json({ message: 'Test topilmadi' });
    }
    
    // Методист может удалять только свои тесты
    if (req.user?.role === UserRole.METHODIST && req.user && test.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    await Test.findByIdAndDelete(req.params.id);
    res.json({ message: 'Test o\'chirildi' });
  } catch (error: any) {
    console.error('Error deleting test:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// ============= БЛОК-ТЕСТЫ =============

// Получить все блок-тесты
router.get('/block-tests', authenticate, requirePermission('view_block_tests'), async (req: AuthRequest, res) => {
  try {
    const filter: any = {};
    
    // Методист видит только свои блок-тесты
    if (req.user?.role === UserRole.METHODIST && req.user) {
      filter.createdBy = req.user.id;
    }
    
    const blockTests = await BlockTest.find(filter)
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 })
      .lean();
    
    res.json(blockTests);
  } catch (error: any) {
    console.error('Error fetching block tests:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Получить блок-тест по ID
router.get('/block-tests/:id', authenticate, requirePermission('view_block_tests'), async (req: AuthRequest, res) => {
  try {
    const blockTest = await BlockTest.findById(req.params.id)
      .populate('createdBy', 'username')
      .lean();
    
    if (!blockTest) {
      return res.status(404).json({ message: 'Blok test topilmadi' });
    }
    
    // Методист может видеть только свои блок-тесты
    if (req.user?.role === UserRole.METHODIST && req.user && blockTest.createdBy?._id?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    res.json(blockTest);
  } catch (error: any) {
    console.error('Error fetching block test:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Создать блок-тест
router.post('/block-tests', authenticate, requirePermission('create_block_tests'), async (req: AuthRequest, res) => {
  try {
    const blockTestData = {
      ...req.body,
      createdBy: req.user?.id
    };
    
    const blockTest = new BlockTest(blockTestData);
    await blockTest.save();
    
    const populatedBlockTest = await BlockTest.findById(blockTest._id)
      .populate('createdBy', 'username');
    
    res.status(201).json(populatedBlockTest);
  } catch (error: any) {
    console.error('Error creating block test:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Обновить блок-тест
router.put('/block-tests/:id', authenticate, requirePermission('edit_block_tests'), async (req: AuthRequest, res) => {
  try {
    const blockTest = await BlockTest.findById(req.params.id);
    
    if (!blockTest) {
      return res.status(404).json({ message: 'Blok test topilmadi' });
    }
    
    // Методист может редактировать только свои блок-тесты
    if (req.user?.role === UserRole.METHODIST && req.user && blockTest.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    Object.assign(blockTest, req.body);
    await blockTest.save();
    
    const populatedBlockTest = await BlockTest.findById(blockTest._id)
      .populate('createdBy', 'username');
    
    res.json(populatedBlockTest);
  } catch (error: any) {
    console.error('Error updating block test:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Удалить блок-тест
router.delete('/block-tests/:id', authenticate, requirePermission('delete_block_tests'), async (req: AuthRequest, res) => {
  try {
    const blockTest = await BlockTest.findById(req.params.id);
    
    if (!blockTest) {
      return res.status(404).json({ message: 'Blok test topilmadi' });
    }
    
    // Методист может удалять только свои блок-тесты
    if (req.user?.role === UserRole.METHODIST && req.user && blockTest.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    await BlockTest.findByIdAndDelete(req.params.id);
    res.json({ message: 'Blok test o\'chirildi' });
  } catch (error: any) {
    console.error('Error deleting block test:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// ============= ПРЕДМЕТЫ (только просмотр) =============

// Получить все предметы
router.get('/subjects', authenticate, requirePermission('view_subjects'), async (req: AuthRequest, res) => {
  try {
    const subjects = await Subject.find({ isActive: true }).sort({ name: 1 }).lean();
    res.json(subjects);
  } catch (error: any) {
    console.error('Error fetching subjects:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

export default router;
