import express from 'express';
import StudentVariant from '../models/StudentVariant';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get all variants for a test
router.get('/test/:testId', authenticate, async (req: AuthRequest, res) => {
  try {
    const variants = await StudentVariant.find({ testId: req.params.testId })
      .populate('studentId')
      .sort({ createdAt: -1 })
      .lean();
    
    console.log(`📦 API: Returning ${variants.length} variants for test ${req.params.testId}`);
    if (variants.length > 0) {
      console.log(`📦 Sample variant:`, {
        variantCode: variants[0].variantCode,
        studentId: variants[0].studentId,
        studentIdType: typeof variants[0].studentId,
        hasStudentIdObject: !!variants[0].studentId?._id,
        hasShuffledQuestions: !!variants[0].shuffledQuestions,
        shuffledQuestionsCount: variants[0].shuffledQuestions?.length,
        firstQuestionVariants: variants[0].shuffledQuestions?.[0]?.variants?.map((v: any) => 
          `${v.letter}: ${v.text?.substring(0, 20)}`
        ),
        firstQuestionCorrect: variants[0].shuffledQuestions?.[0]?.correctAnswer
      });
    } else {
      console.log(`⚠️ No variants found for test ${req.params.testId}`);
    }
    
    res.json(variants);
  } catch (error: any) {
    console.error('❌ Error fetching test variants:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Get all variants for a block test
router.get('/block-test/:blockTestId', authenticate, async (req: AuthRequest, res) => {
  try {
    const variants = await StudentVariant.find({ testId: req.params.blockTestId })
      .populate('studentId')
      .sort({ createdAt: -1 })
      .lean();
    
    console.log(`📦 API: Returning ${variants.length} variants for block test ${req.params.blockTestId}`);
    if (variants.length > 0) {
      console.log(`📦 Sample variant:`, {
        variantCode: variants[0].variantCode,
        studentId: variants[0].studentId,
        studentIdType: typeof variants[0].studentId,
        hasStudentIdObject: !!variants[0].studentId?._id,
        hasShuffledQuestions: !!variants[0].shuffledQuestions,
        shuffledQuestionsCount: variants[0].shuffledQuestions?.length,
        firstAnswer: variants[0].shuffledQuestions?.[0]?.correctAnswer
      });
    } else {
      console.log(`⚠️ No variants found for block test ${req.params.blockTestId}`);
    }
    
    res.json(variants);
  } catch (error: any) {
    console.error('❌ Error fetching block test variants:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Get single variant by ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const variant = await StudentVariant.findById(req.params.id)
      .populate('studentId')
      .populate('testId')
      .lean();
    
    if (!variant) {
      return res.status(404).json({ message: 'Variant topilmadi' });
    }
    
    res.json(variant);
  } catch (error) {
    console.error('Error fetching variant:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// Get variant by variant code
router.get('/by-code/:variantCode', authenticate, async (req: AuthRequest, res) => {
  try {
    const variant = await StudentVariant.findOne({ 
      variantCode: req.params.variantCode 
    })
      .populate('studentId')
      .populate('testId')
      .lean();
    
    if (!variant) {
      return res.status(404).json({ message: 'Variant topilmadi' });
    }
    
    res.json(variant);
  } catch (error) {
    console.error('Error fetching variant by code:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// Get variants by query params (for BlockTestAnswerSheetsViewPage)
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { studentId, testId } = req.query;
    
    const query: any = {};
    if (studentId) query.studentId = studentId;
    if (testId) query.testId = testId;
    
    const variants = await StudentVariant.find(query)
      .populate('studentId')
      .populate('testId')
      .lean();
    
    res.json(variants);
  } catch (error) {
    console.error('Error fetching variants:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

export default router;
