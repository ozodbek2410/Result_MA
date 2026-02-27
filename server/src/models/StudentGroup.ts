import mongoose, { Schema, Document } from 'mongoose';

export interface IStudentGroup extends Document {
  studentId: mongoose.Types.ObjectId;
  groupId: mongoose.Types.ObjectId;
  subjectId: mongoose.Types.ObjectId;
  groupLetter?: string; // A, B, C, D, E, F — per-subject assignment
  createdAt: Date;
}

const StudentGroupSchema = new Schema<IStudentGroup>({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
  groupLetter: { type: String, enum: ['A', 'B', 'C', 'D', 'E', 'F'] },
  createdAt: { type: Date, default: Date.now }
});

// Add indexes for faster queries
StudentGroupSchema.index({ studentId: 1 });
StudentGroupSchema.index({ groupId: 1 });
StudentGroupSchema.index({ subjectId: 1 });
// One student can have different letters per subject in the same group
StudentGroupSchema.index({ studentId: 1, groupId: 1, subjectId: 1 }, { unique: true, sparse: true });

export default mongoose.model<IStudentGroup>('StudentGroup', StudentGroupSchema);
