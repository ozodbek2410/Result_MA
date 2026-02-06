import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../models/User';
import { cacheMiddleware } from '../middleware/cache';
import Branch from '../models/Branch';
import Subject from '../models/Subject';
import Student from '../models/Student';
import User from '../models/User';
import Test from '../models/Test';
import TestResult from '../models/TestResult';
import Group from '../models/Group';
import StudentGroup from '../models/StudentGroup';
import mongoose from 'mongoose';

const router = Router();

// Get teacher dashboard statistics
router.get('/teacher/dashboard', authenticate, cacheMiddleware(300), async (req: AuthRequest, res) => {
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

// Get branch dashboard statistics
router.get('/branch/dashboard', authenticate, cacheMiddleware(300), async (req: AuthRequest, res) => {
  try {
    const branchId = req.user?.branchId;
    if (!branchId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get all students in the branch
    const students = await Student.find({ branchId }).select('_id fullName').lean();
    const studentIds = students.map(s => s._id);

    if (studentIds.length === 0) {
      return res.json({
        topStudents: []
      });
    }

    // Calculate average percentage for each student
    const studentStats = await Promise.all(
      studentIds.map(async (studentId) => {
        const results = await TestResult.find({ studentId })
          .select('percentage')
          .lean();

        const student = students.find(s => s._id.toString() === studentId.toString());

        // Return student even if no test results
        return {
          _id: studentId,
          fullName: student?.fullName || 'Unknown',
          testsCompleted: results.length,
          averageScore: results.length > 0 
            ? Math.round((results.reduce((sum, r) => sum + r.percentage, 0) / results.length) * 10) / 10
            : 0
        };
      })
    );

    // Sort by average score (descending), then by name (ascending)
    const sortedStudents = studentStats.sort((a, b) => {
      if (b.averageScore !== a.averageScore) {
        return b.averageScore - a.averageScore;
      }
      return a.fullName.localeCompare(b.fullName);
    });

    // Assign ranks (same score = same rank)
    const topStudents = sortedStudents.slice(0, 100).map((student, index, array) => {
      let rank = index + 1;
      
      // Check if previous student has same score
      if (index > 0 && array[index - 1].averageScore === student.averageScore) {
        rank = (array[index - 1] as any).rank;
      }
      
      return {
        ...student,
        rank
      };
    });

    res.json({
      topStudents
    });
  } catch (error: any) {
    console.error('Error fetching branch dashboard statistics:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get overall statistics
router.get('/', authenticate, authorize(UserRole.SUPER_ADMIN), cacheMiddleware(600), async (req: AuthRequest, res) => {
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
      User.countDocuments({ role: UserRole.TEACHER, isActive: true }),
      Test.countDocuments(),
      TestResult.countDocuments(),
      TestResult.aggregate([
        { $group: { _id: null, avgScore: { $avg: '$percentage' } } }
      ]),
      Branch.find().lean()
    ]);

    const averageScore = avgScoreResult.length > 0 ? avgScoreResult[0].avgScore : 0;

    // Use aggregation to get branch statistics efficiently
    const [studentsByBranch, teachersByBranch, groupsByBranch, testResultsByBranch] = await Promise.all([
      Student.aggregate([
        { $group: { _id: '$branchId', count: { $sum: 1 } } }
      ]),
      User.aggregate([
        { 
          $match: { 
            role: UserRole.TEACHER,
            isActive: true
          } 
        },
        { $group: { _id: '$branchId', count: { $sum: 1 } } }
      ]),
      Group.aggregate([
        { $group: { _id: '$branchId', count: { $sum: 1 } } }
      ]),
      // Get average test percentage per branch - через студентов
      TestResult.aggregate([
        {
          $lookup: {
            from: 'students',
            localField: 'studentId',
            foreignField: '_id',
            as: 'student'
          }
        },
        { $unwind: '$student' },
        {
          $group: {
            _id: '$student.branchId',
            avgPercentage: { $avg: '$percentage' },
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Create lookup maps for O(1) access
    const studentsMap = new Map(studentsByBranch.map(item => [item._id?.toString(), item.count]));
    const teachersMap = new Map(teachersByBranch.map(item => [item._id?.toString(), item.count]));
    const groupsMap = new Map(groupsByBranch.map(item => [item._id?.toString(), item.count]));
    const testResultsMap = new Map(testResultsByBranch.map(item => [item._id?.toString(), { avg: item.avgPercentage, count: item.count }]));

    // Build branch stats efficiently
    const branchStats = branches.map(branch => {
      const branchId = branch._id.toString();
      const testData = testResultsMap.get(branchId);
      const averageScore = testData ? Math.round(testData.avg) : 0;

      return {
        _id: branch._id,
        name: branch.name,
        studentsCount: studentsMap.get(branchId) || 0,
        teachersCount: teachersMap.get(branchId) || 0,
        groupsCount: groupsMap.get(branchId) || 0,
        averageScore,
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
