import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { invalidateCache } from '../middleware/cache';
import { Assignment, AssignmentSubmission } from '../models/Assignment';
import Group from '../models/Group';
import StudentGroup from '../models/StudentGroup';

const router = express.Router();

// Get all assignments for teacher's groups
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const assignments = await Assignment.find({ 
      branchId: req.user?.branchId,
      createdBy: req.user?.id
    })
      .populate('groupId')
      .populate('subjectId')
      .sort({ createdAt: -1 });
    
    res.json(assignments);
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// Get assignment by ID with submissions
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('groupId')
      .populate('subjectId');
    
    if (!assignment) {
      return res.status(404).json({ message: 'Topshiriq topilmadi' });
    }

    const submissions = await AssignmentSubmission.find({ 
      assignmentId: req.params.id 
    }).populate('studentId');

    res.json({ assignment, submissions });
  } catch (error) {
    console.error('Error fetching assignment:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// Create new assignment
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { groupId, title, description, type, fileUrl, dueDate, questions } = req.body;

    if (!groupId || !title || !type) {
      return res.status(400).json({ message: 'Majburiy maydonlarni to\'ldiring' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }

    const assignment = new Assignment({
      groupId,
      subjectId: group.subjectId,
      branchId: req.user?.branchId,
      createdBy: req.user?.id,
      title,
      description,
      type,
      fileUrl,
      dueDate,
      maxScore: 100,
      questions: questions || []
    });

    await assignment.save();

    // Get students from StudentGroup and create submissions
    const studentGroups = await StudentGroup.find({ groupId }).select('studentId');
    const studentIds = studentGroups.map(sg => sg.studentId);

    if (studentIds.length > 0) {
      const submissions = studentIds.map(studentId => ({
        assignmentId: assignment._id,
        studentId
      }));
      await AssignmentSubmission.insertMany(submissions);
    }

    // Инвалидируем кэш заданий
    await invalidateCache('/api/assignments');

    res.status(201).json({ 
      message: 'Topshiriq muvaffaqiyatli yaratildi',
      assignment
    });
  } catch (error: any) {
    console.error('Error creating assignment:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Update assignment
router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { title, description, type, fileUrl, dueDate } = req.body;

    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ message: 'Topshiriq topilmadi' });
    }

    assignment.title = title || assignment.title;
    assignment.description = description !== undefined ? description : assignment.description;
    assignment.type = type || assignment.type;
    assignment.fileUrl = fileUrl !== undefined ? fileUrl : assignment.fileUrl;
    assignment.dueDate = dueDate !== undefined ? dueDate : assignment.dueDate;

    await assignment.save();

    // Инвалидируем кэш заданий
    await invalidateCache('/api/assignments');

    res.json({ 
      message: 'Topshiriq muvaffaqiyatli yangilandi',
      assignment
    });
  } catch (error: any) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Delete assignment
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ message: 'Topshiriq topilmadi' });
    }

    // Delete all submissions
    await AssignmentSubmission.deleteMany({ assignmentId: req.params.id });
    
    await Assignment.findByIdAndDelete(req.params.id);

    // Инвалидируем кэш заданий
    await invalidateCache('/api/assignments');

    res.json({ message: 'Topshiriq o\'chirildi' });
  } catch (error) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// Grade a submission
router.post('/:id/grade/:submissionId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { percentage, notes } = req.body;

    if (percentage === undefined || percentage < 0 || percentage > 100) {
      return res.status(400).json({ message: 'Foiz 0 dan 100 gacha bo\'lishi kerak' });
    }

    const submission = await AssignmentSubmission.findById(req.params.submissionId);
    if (!submission) {
      return res.status(404).json({ message: 'Topshiriq topilmadi' });
    }

    // Get assignment to get subjectId
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ message: 'Topshiriq topilmadi' });
    }

    submission.percentage = percentage;
    submission.notes = notes;
    submission.gradedAt = new Date();
    if (req.user?.id) {
      submission.gradedBy = req.user.id as any;
    }

    await submission.save();

    // Add grade to student profile using atomic update
    const Student = (await import('../models/Student')).default;
    
    const gradeData = {
      assignmentId: assignment._id,
      subjectId: assignment.subjectId,
      percentage,
      notes,
      gradedAt: new Date()
    };
    
    // Используем atomic update для избежания race condition
    await Student.findOneAndUpdate(
      { 
        _id: submission.studentId,
        'grades.assignmentId': assignment._id
      },
      {
        $set: {
          'grades.$': gradeData
        }
      }
    );
    
    // Если оценка не найдена, добавляем новую
    await Student.findOneAndUpdate(
      { 
        _id: submission.studentId,
        'grades.assignmentId': { $ne: assignment._id }
      },
      {
        $push: {
          grades: gradeData
        }
      }
    );

    res.json({ 
      message: 'Baho qo\'yildi',
      submission
    });
  } catch (error: any) {
    console.error('Error grading submission:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

export default router;
