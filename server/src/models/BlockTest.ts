import mongoose, { Schema, Document } from 'mongoose';
import { IQuestion } from './Test';

export interface IStudentConfig {
  studentId: mongoose.Types.ObjectId;
  subjects: {
    subjectId: mongoose.Types.ObjectId;
    questionCount: number;
    pointsConfig?: { from: number; to: number; points: number }[];
  }[];
}

export interface IBlockTest extends Document {
  branchId: mongoose.Types.ObjectId;
  classNumber: number;
  date: Date;
  periodMonth: number; // 1-12 (январь-декабрь)
  periodYear: number; // год
  subjectTests: {
    subjectId: mongoose.Types.ObjectId;
    groupLetter?: string; // A, B, C, D или null для общих тестов
    questions: IQuestion[];
  }[];
  studentConfigs: IStudentConfig[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const StudentConfigSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  subjects: [{
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    questionCount: { type: Number, required: true },
    pointsConfig: [{
      from: Number,
      to: Number,
      points: Number
    }]
  }]
}, { _id: false });

const BlockTestSchema = new Schema<IBlockTest>({
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  classNumber: { type: Number, required: true },
  date: { type: Date, required: true },
  periodMonth: { type: Number, required: true, min: 1, max: 12 },
  periodYear: { type: Number, required: true },
  subjectTests: [{
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    groupLetter: { type: String, required: false, default: null }, // A, B, C, D или null для общих
    questions: [Schema.Types.Mixed]
  }],
  studentConfigs: [StudentConfigSchema],
  createdBy: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
  createdAt: { type: Date, default: Date.now }
});

// Add indexes for faster queries
BlockTestSchema.index({ branchId: 1 });
BlockTestSchema.index({ classNumber: 1 });
BlockTestSchema.index({ branchId: 1, classNumber: 1, periodMonth: 1, periodYear: 1 }); // Compound index
BlockTestSchema.index({ date: -1 }); // For sorting
BlockTestSchema.index({ createdBy: 1 });

export default mongoose.model<IBlockTest>('BlockTest', BlockTestSchema);
