import mongoose, { Schema, Document } from 'mongoose';

export interface ISubject extends Document {
  crmId?: number;
  nameUzb: string;
  isMandatory: boolean;
  isActive: boolean;
  lastSyncedAt?: Date;
  createdAt: Date;
}

const SubjectSchema = new Schema<ISubject>({
  crmId: { type: Number, sparse: true, unique: true },
  nameUzb: { type: String, required: true },
  isMandatory: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastSyncedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

SubjectSchema.index({ isActive: 1 });
SubjectSchema.index({ isMandatory: 1 });

export default mongoose.model<ISubject>('Subject', SubjectSchema);
