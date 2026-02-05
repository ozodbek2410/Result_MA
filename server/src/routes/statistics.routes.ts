import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../models/User';
import Branch from '../models/Branch';
import Subject from '../models/Subject';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Test from '../models/Test';
import TestResult from '../models/TestResult';
import Group from '../models/Group';
import StudentGroup from '../models/StudentGroup';
import mongoose from 'mongoose';

const router = Router();

// Get teacher dashboard statistics
router.get('/teacher/dashboard', authenticate, async (req, res) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get teacher's groups
    const teacherGroups = await Group.find({ teacherId }).select('_id name').lean();
    const groupIds = teacherGroups.map(g => g._id);

    if (groupIds.length === 0) {
      return res.json({
        topGroups: [],
        topStudents: []
      });
    }

    // Get students in teacher's groups
    const studentGroups = await StudentGroup.find({ 
      groupId: { $in: groupIds } 
    }).select('studentId groupId').lean();

    const studentIds = [...new Set(studentGroups.map(sg => sg.studentId))];

    // Calculate average percentage for each group
    const groupStats = await Promise.all(
      groupIds.map(async (groupId) => {
        const groupStudentIds = studentGroups
          .filter(sg => sg.groupId.toString() === groupId.toString())
          .map(sg => sg.studentId);

        if (groupStudentIds.length === 0) {
          return null;
        }

        // Get test results for students in this group
        const results = await TestResult.find({
          studentId: { $in: groupStudentIds }
        }).select('percentage').lean();

        if (results.length === 0) {
          return null;
        }

        const avgPercentage = results.reduce((sum, r) => sum + r.percentage, 0) / results.length;
        const group = teacherGroups.find(g => g._id.toString() === groupId.toString());

        return {
          groupId,
          groupName: group?.name || 'Unknown',
          studentsCount: groupStudentIds.length,
          testsCount: results.length,
          averagePercentage: Math.round(avgPercentage * 10) / 10
        };
      })
    );

    // Filter out null values and sort by average percentage
    const topGroups = groupStats
      .filter(g => g !== null)
      .sort((a, b) => b!.averagePercentage - a!.averagePercentage)
      .slice(0, 5);

    // Calculate average percentage for each student
    const studentStats = await Promise.all(
      studentIds.map(async (studentId) => {
        const results = await TestResult.find({ studentId })
          .select('percentage')
          .lean();

        if (results.length === 0) {
          return null;
        }

        const avgPercentage = results.reduce((sum, r) => sum + r.percentage, 0) / results.length;
        const student = await Student.findById(studentId).select('fullName').lean();

        // Find which group this student belongs to
        const studentGroup = studentGroups.find(sg => sg.studentId.toString() === studentId.toString());
        const group = teacherGroups.find(g => g._id.toString() === studentGroup?.groupId.toString());

        return {
          studentId,
          studentName: student?.fullName || 'Unknown',
          groupName: group?.name || 'Unknown',
          testsCount: results.length,
          averagePercentage: Math.round(avgPercentage * 10) / 10
        };
      })
    );

    // Filter out null values and sort by average percentage
    const topStudents = studentStats
      .filter(s => s !== null)
      .sort((a, b) => b!.averagePercentage - a!.averagePercentage)
      .slice(0, 10);

    res.json({
      topGroups,
      topStudents
    });
  } catch (error: any) {
    console.error('Error fetching teacher dashboard statistics:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get overall statistics
router.get('/', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    // Use Promise.all to run all queries in parallel
    const [
      totalBranches,
      totalSubjects,
      totalStudents,
      totalTeachers,
      totalTests,
      totalTestResults,
      avgScoreResult,
      branches
    ] = await Promise.all([
      Branch.countDocuments(),
      Subject.countDocuments(),
      Student.countDocuments(),
      Teacher.countDocuments(),
      Test.countDocuments(),
      TestResult.countDocuments(),
      TestResult.aggregate([
        { $group: { _id: null, avgScore: { $avg: '$score' } } }
      ]),
      Branch.find().lean()
    ]);

    const averageScore = avgScoreResult.length > 0 ? avgScoreResult[0].avgScore : 0;

    // Use aggregation to get branch statistics efficiently
    const [studentsByBranch, teachersByBranch, groupsByBranch, groupCapacityByBranch, studentGroupsByBranch] = await Promise.all([
      Student.aggregate([
        { $group: { _id: '$branchId', count: { $sum: 1 } } }
      ]),
      Teacher.aggregate([
        { $group: { _id: '$branchId', count: { $sum: 1 } } }
      ]),
      Group.aggregate([
        { $group: { _id: '$branchId', count: { $sum: 1 } } }
      ]),
      // Get total capacity per branch
      Group.aggregate([
        { 
          $group: { 
            _id: '$branchId', 
            totalCapacity: { $sum: { $ifNull: ['$capacity', 20] } }
          } 
        }
      ]),
      // Get total students in groups per branch
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
          $group: {
            _id: '$group.branchId',
            totalStudents: { $sum: 1 }
          }
        }
      ])
    ]);

    // Create lookup maps for O(1) access
    const studentsMap = new Map(studentsByBranch.map(item => [item._id?.toString(), item.count]));
    const teachersMap = new Map(teachersByBranch.map(item => [item._id?.toString(), item.count]));
    const groupsMap = new Map(groupsByBranch.map(item => [item._id?.toString(), item.count]));
    const capacityMap = new Map(groupCapacityByBranch.map(item => [item._id?.toString(), item.totalCapacity]));
    const groupStudentsMap = new Map(studentGroupsByBranch.map(item => [item._id?.toString(), item.totalStudents]));

    // Build branch stats efficiently
    const branchStats = branches.map(branch => {
      const branchId = branch._id.toString();
      const totalCapacity = capacityMap.get(branchId) || 0;
      const totalStudentsInGroups = groupStudentsMap.get(branchId) || 0;
      const fillPercentage = totalCapacity > 0 
        ? Math.round((totalStudentsInGroups / totalCapacity) * 100) 
        : 0;

      return {
        _id: branch._id,
        name: branch.name,
        studentsCount: studentsMap.get(branchId) || 0,
        teachersCount: teachersMap.get(branchId) || 0,
        groupsCount: groupsMap.get(branchId) || 0,
        fillPercentage,
      };
    });

    res.json({
      totalBranches,
      totalSubjects,
      totalStudents,
      totalTeachers,
      totalTests,
      totalTestResults,
      averageScore: Math.round(averageScore * 100) / 100,
      branches: branchStats,
    });
  } catch (error: any) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
