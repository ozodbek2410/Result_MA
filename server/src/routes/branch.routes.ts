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

router.put('/:id', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!branch) {
      return res.status(404).json({ message: 'Filial topilmadi' });
    }
    res.json(branch);
  } catch (error: any) {
    console.error('Error updating branch:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.delete('/:id', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    const branch = await Branch.findByIdAndUpdate(req.params.id, { isActive: false });
    if (!branch) {
      return res.status(404).json({ message: 'Filial topilmadi' });
    }
    res.json({ message: 'Filial o\'chirildi' });
  } catch (error: any) {
    console.error('Error deleting branch:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Get branch statistics
router.get('/:id/statistics', authenticate, async (req, res) => {
  try {
    const branchId = req.params.id;

    // Run all queries in parallel
    const [branch, studentsCount, teachersCount, groups, studentGroupCounts, testResults] = await Promise.all([
      Branch.findById(branchId).lean(),
      Student.countDocuments({ branchId }),
      User.countDocuments({ branchId, role: UserRole.TEACHER, isActive: true }),
      Group.find({ branchId }).select('_id name capacity').lean(),
      StudentGroup.aggregate([
        {
          $lookup: {
            from: 'groups',
            localField: 'groupId',
            foreignField: '_id',
            as: 'group'
          }
        },
        { $unwind: '$group' },
        {
          $match: {
            'group.branchId': new mongoose.Types.ObjectId(branchId)
          }
        },
        {
          $group: {
            _id: '$groupId',
            count: { $sum: 1 }
          }
        }
      ]),
      // Get test results for students in this branch
      TestResult.aggregate([
        {
          $match: {
            branchId: new mongoose.Types.ObjectId(branchId)
          }
        },
        {
          $lookup: {
            from: 'studentgroups',
            localField: 'studentId',
            foreignField: 'studentId',
            as: 'studentGroups'
          }
        },
        { $unwind: { path: '$studentGroups', preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id: '$studentGroups.groupId',
            avgPercentage: { $avg: '$percentage' },
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    if (!branch) {
      return res.status(404).json({ message: 'Filial topilmadi' });
    }

    // Create maps for quick lookup
    const studentCountMap = new Map(
      studentGroupCounts.map(item => [item._id.toString(), item.count])
    );
    
    const testResultsMap = new Map(
      testResults.map(item => [item._id?.toString(), { avg: item.avgPercentage, count: item.count }])
    );

    // Calculate student counts and average percentages for groups efficiently
    const groupsWithCounts = groups.map(group => {
      const groupId = group._id.toString();
      const testData = testResultsMap.get(groupId);
      
      return {
        _id: group._id,
        name: group.name,
        capacity: group.capacity || 20,
        studentsCount: studentCountMap.get(groupId) || 0,
        averageScore: testData ? Math.round(testData.avg) : 0
      };
    });

    res.json({
      branch: {
        _id: branch._id,
        name: branch.name,
        location: branch.location
      },
      studentsCount,
      teachersCount,
      groupsCount: groups.length,
      groups: groupsWithCounts
    });
  } catch (error: any) {
    console.error('Error fetching branch statistics:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

export default router;
