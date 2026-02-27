import mongoose, { Schema, Document } from 'mongoose';

export interface ITeacher extends Document {
  userId: mongoose.Types.ObjectId;
  branchId: mongoose.Types.ObjectId;
  fullName: string;
  phone?: string;
  createdAt: Date;
}

const TeacherSchema = new Schema<ITeacher>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  fullName: { type: String, required: true },
  phone: String,
  createdAt: { type: Date, default: Date.now }
});

// Add indexes for faster queries
TeacherSchema.index({ branchId: 1 });
TeacherSchema.index({ userId: 1 });

export default mongoose.model<ITeacher>('Teacher', TeacherSchema);
