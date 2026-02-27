import mongoose, { Schema, Document } from 'mongoose';

export enum AssignmentType {
  YOZMA_ISH = 'yozma_ish',
  DIKTANT = 'diktant',
  OGZAKI = 'ogzaki',
  SAVOL_JAVOB = 'savol_javob',
  YOPIQ_TEST = 'yopiq_test'
}

export interface IAssignment extends Document {
  groupId: mongoose.Types.ObjectId;
  subjectId: mongoose.Types.ObjectId;
  branchId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  type: AssignmentType;
  fileUrl?: string;
  dueDate?: Date;
  maxScore: number;
  questions?: {
    text: string;
    order: number;
    hasVariants?: boolean;
    variants?: {
      letter: string;
      text: string;
    }[];
    correctAnswer?: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IAssignmentSubmission extends Document {
  assignmentId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  score?: number;
  percentage?: number;
  submittedAt?: Date;
  gradedAt?: Date;
  gradedBy?: mongoose.Types.ObjectId;
  notes?: string;
}

const AssignmentSchema = new Schema({
  groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String },
  type: { 
    type: String, 
    enum: Object.values(AssignmentType),
    required: true 
  },
  fileUrl: { type: String },
  dueDate: { type: Date },
  maxScore: { type: Number, default: 100 },
  questions: [{
    text: { type: String, required: true },
    order: { type: Number, required: true },
    hasVariants: { type: Boolean, default: false },
    variants: [{
      letter: { type: String },
      text: { type: String }
    }],
    correctAnswer: { type: String }
  }]
}, {
  timestamps: true
});

// Add indexes for faster queries
AssignmentSchema.index({ groupId: 1 });
AssignmentSchema.index({ branchId: 1 });
AssignmentSchema.index({ createdBy: 1 });
AssignmentSchema.index({ subjectId: 1 });
AssignmentSchema.index({ dueDate: 1 });
AssignmentSchema.index({ createdAt: -1 });

const AssignmentSubmissionSchema = new Schema({
  assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  score: { type: Number, min: 0 },
  percentage: { type: Number, min: 0, max: 100 },
  submittedAt: { type: Date },
  gradedAt: { type: Date },
  gradedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String }
}, {
  timestamps: true
});

// Add indexes for faster queries
AssignmentSubmissionSchema.index({ assignmentId: 1 });
AssignmentSubmissionSchema.index({ studentId: 1 });
AssignmentSubmissionSchema.index({ assignmentId: 1, studentId: 1 }); // Compound index

export const Assignment = mongoose.model<IAssignment>('Assignment', AssignmentSchema);
export const AssignmentSubmission = mongoose.model<IAssignmentSubmission>('AssignmentSubmission', AssignmentSubmissionSchema);
