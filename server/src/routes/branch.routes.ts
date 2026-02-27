import express from 'express';
import mongoose from 'mongoose';
import Branch from '../models/Branch';
import Student from '../models/Student';
import User from '../models/User';
import Group from '../models/Group';
import StudentGroup from '../models/StudentGroup';
import TestResult from '../models/TestResult';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../models/User';
import { cacheMiddleware } from '../middleware/cache';

const router = express.Router();

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const branches = await Branch.find({ isActive: true });
    console.log('Fetched branches:', branches.length);
    res.json(branches);
  } catch (error: any) {
    console.error('Error fetching branches:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.post('/', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    console.log('Creating branch:', req.body);
    const { name, location } = req.body;
    
    if (!name || !location) {
      return res.status(400).json({ message: 'Nomi va manzil majburiy' });
    }
    
    const branch = new Branch({ name, location });
    await branch.save();
    console.log('Branch created:', branch);
    res.status(201).json(branch);
  } catch (error: any) {
    console.error('Error creating branch:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.put('/:id', authenticate, authorize(UserRole.SUPER_ADMIN), async (req: AuthRequest, res) => {
  try {
    console.log('=== ОБНОВЛЕНИЕ ФИЛИАЛА ===');
    console.log('Branch ID:', req.params.id);
    console.log('User role:', req.user?.role);
    console.log('Update data:', req.body);
    
    const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!branch) {
      return res.status(404).json({ message: 'Filial topilmadi' });
    }
    console.log('✅ Филиал обновлен:', branch);
    res.json(branch);
  } catch (error: any) {
    console.error('Error updating branch:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.delete('/:id', authenticate, authorize(UserRole.SUPER_ADMIN), async (req: AuthRequest, res) => {
  try {
    console.log('=== УДАЛЕНИЕ ФИЛИАЛА ===');
    console.log('Branch ID:', req.params.id);
    console.log('User role:', req.user?.role);
    
    const branch = await Branch.findByIdAndUpdate(req.params.id, { isActive: false });
    if (!branch) {
      return res.status(404).json({ message: 'Filial topilmadi' });
    }
    console.log('✅ Филиал удален:', branch);
    res.json({ message: 'Filial o\'chirildi' });
  } catch (error: any) {
    console.error('Error deleting branch:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Get branch statistics - OPTIMIZED
router.get('/:id/statistics', authenticate, async (req, res) => {
  try {
    const branchId = req.params.id;
    console.log('🔍 Fetching statistics for branch:', branchId);

    // Run all queries in parallel with optimized aggregation
    const [branch, studentsCount, teachersCount, groupsWithStats] = await Promise.all([
      Branch.findById(branchId).select('_id name location').lean(),
      Student.countDocuments({ branchId }),
      User.countDocuments({ branchId, role: UserRole.TEACHER, isActive: true }),
      
      // OPTIMIZED: Get all group data with student counts and average scores in ONE query
      Group.aggregate([
        {
          $match: { branchId: new mongoose.Types.ObjectId(branchId) }
        },
        {
          $lookup: {
            from: 'studentgroups',
            localField: '_id',
            foreignField: 'groupId',
            as: 'studentGroups'
          }
        },
        {
          $addFields: {
            studentsCount: { $size: '$studentGroups' },
            studentIds: '$studentGroups.studentId'
          }
        },
        {
          $lookup: {
            from: 'testresults',
            let: { studentIds: '$studentIds' },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ['$studentId', '$$studentIds'] }
                }
              },
              {
                $group: {
                  _id: null,
                  avgPercentage: { $avg: '$percentage' }
                }
              }
            ],
            as: 'testStats'
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            studentsCount: 1,
            averageScore: {
              $cond: {
                if: { $gt: [{ $size: '$testStats' }, 0] },
                then: { $round: [{ $arrayElemAt: ['$testStats.avgPercentage', 0] }, 0] },
                else: 0
              }
            }
          }
        },
        {
          $sort: { name: 1 }
        }
      ])
    ]);

    if (!branch) {
      console.log('❌ Branch not found:', branchId);
      return res.status(404).json({ message: 'Filial topilmadi' });
    }

    console.log('✅ Statistics fetched successfully');
    console.log('📊 Groups:', groupsWithStats.length);
    console.log('👥 Students:', studentsCount);
    console.log('👨‍🏫 Teachers:', teachersCount);

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({
      branch: {
        _id: branch._id,
        name: branch.name,
        location: branch.location
      },
      studentsCount,
      teachersCount,
      groupsCount: groupsWithStats.length,
      groups: groupsWithStats
    });
  } catch (error: any) {
    console.error('❌ Error fetching branch statistics:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

export default router;
