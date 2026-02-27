import express from 'express';
import Application from '../models/Application.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { UserRole } from '../models/User.js';

const router = express.Router();

// Public route - Create application from landing page
router.post('/public', async (req, res) => {
  try {
    const { fullName, phone, grade } = req.body;

    if (!fullName || !phone || !grade) {
      return res.status(400).json({ message: 'Barcha maydonlarni to\'ldiring' });
    }

    const application = await Application.create({
      fullName,
      phone,
      grade,
      status: 'pending',
    });

    res.status(201).json({
      message: 'Arizangiz qabul qilindi! Tez orada siz bilan bog\'lanamiz.',
      application,
    });
  } catch (error) {
    console.error('Error creating application:', error);
    res.status(500).json({ message: 'Xatolik yuz berdi' });
  }
});

// Admin routes - Get all applications
router.get('/', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query: any = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    const [applications, total] = await Promise.all([
      Application.find(query)
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip(skip)
        .lean(),
      Application.countDocuments(query),
    ]);

    res.json({
      applications,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ message: 'Xatolik yuz berdi' });
  }
});

// Get application by ID
router.get('/:id', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Ariza topilmadi' });
    }

    res.json(application);
  } catch (error) {
    console.error('Error fetching application:', error);
    res.status(500).json({ message: 'Xatolik yuz berdi' });
  }
});

// Update application status
router.patch('/:id', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    const updateData: any = {};
    if (status) {
      updateData.status = status;
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const application = await Application.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!application) {
      return res.status(404).json({ message: 'Ariza topilmadi' });
    }

    res.json({
      message: 'Ariza yangilandi',
      application,
    });
  } catch (error) {
    console.error('Error updating application:', error);
    res.status(500).json({ message: 'Xatolik yuz berdi' });
  }
});

// Delete application
router.delete('/:id', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    const application = await Application.findByIdAndDelete(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Ariza topilmadi' });
    }

    res.json({ message: 'Ariza o\'chirildi' });
  } catch (error) {
    console.error('Error deleting application:', error);
    res.status(500).json({ message: 'Xatolik yuz berdi' });
  }
});

// Get statistics
router.get('/stats/summary', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    const [total, pending, contacted, accepted, rejected] = await Promise.all([
      Application.countDocuments(),
      Application.countDocuments({ status: 'pending' }),
      Application.countDocuments({ status: 'contacted' }),
      Application.countDocuments({ status: 'accepted' }),
      Application.countDocuments({ status: 'rejected' }),
    ]);

    res.json({
      total,
      pending,
      contacted,
      accepted,
      rejected,
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ message: 'Xatolik yuz berdi' });
  }
});

export default router;
