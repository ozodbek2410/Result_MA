import mongoose, { Schema, Document } from 'mongoose';

export interface IGroup extends Document {
  crmId?: number;
  branchId: mongoose.Types.ObjectId;
  name: string;
  classNumber: number;
  subjectId?: mongoose.Types.ObjectId;
  letter: string;
  teacherId?: mongoose.Types.ObjectId;
  directionId?: mongoose.Types.ObjectId;
  capacity?: number;
  pupilCount?: number;
  educationYear?: string;
  isActive: boolean;
  lastSyncedAt?: Date;
  createdAt: Date;
}

const GroupSchema = new Schema<IGroup>({
  crmId: { type: Number, sparse: true, unique: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  name: { type: String, required: true },
  classNumber: { type: Number, required: true },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
  letter: { type: String, required: true },
  teacherId: { type: Schema.Types.ObjectId, ref: 'User' },
  directionId: { type: Schema.Types.ObjectId, ref: 'Direction' },
  capacity: { type: Number, default: 20 },
  pupilCount: Number,
  educationYear: String,
  isActive: { type: Boolean, default: true },
  lastSyncedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

GroupSchema.index({ branchId: 1 });
GroupSchema.index({ teacherId: 1 });
GroupSchema.index({ branchId: 1, classNumber: 1 });
GroupSchema.index({ subjectId: 1 });
GroupSchema.index({ isActive: 1 });

export default mongoose.model<IGroup>('Group', GroupSchema);
