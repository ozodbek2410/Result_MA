import mongoose, { Schema, Document } from 'mongoose';

export interface IStudent extends Document {
  crmId?: number;
  branchId: mongoose.Types.ObjectId;
  fullName: string;
  firstName?: string;
  lastName?: string;
  patronymic?: string;
  birthDate?: Date;
  gender?: 'male' | 'female';
  classNumber: number;
  phone?: string;
  motherPhone?: string;
  directionId?: mongoose.Types.ObjectId;
  subjectIds: mongoose.Types.ObjectId[];
  profileToken: string;
  isGraduated: boolean;
  isActive: boolean;
  lastSyncedAt?: Date;
  grades: Array<{
    assignmentId: mongoose.Types.ObjectId;
    subjectId: mongoose.Types.ObjectId;
    percentage: number;
    notes?: string;
    gradedAt: Date;
  }>;
  createdAt: Date;
}

const StudentSchema = new Schema<IStudent>({
  crmId: { type: Number, sparse: true, unique: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  fullName: { type: String, required: true },
  firstName: String,
  lastName: String,
  patronymic: String,
  birthDate: Date,
  gender: { type: String, enum: ['male', 'female'] },
  classNumber: { type: Number, required: true },
  phone: String,
  motherPhone: String,
  directionId: { type: Schema.Types.ObjectId, ref: 'Direction' },
  subjectIds: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
  profileToken: { type: String, required: true, unique: true },
  isGraduated: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastSyncedAt: Date,
  grades: [{
    assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment' },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
    percentage: { type: Number, required: true },
    notes: String,
    gradedAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

// Add indexes for faster queries
StudentSchema.index({ branchId: 1 });
StudentSchema.index({ classNumber: 1 });
StudentSchema.index({ branchId: 1, classNumber: 1 });
StudentSchema.index({ fullName: 1 });
StudentSchema.index({ isActive: 1 });
// profileToken уже имеет unique index из схемы

export default mongoose.model<IStudent>('Student', StudentSchema);
