import mongoose, { Schema, Document } from 'mongoose';

export interface ISubjectChoice {
  type: 'single' | 'choice';
  subjectIds: mongoose.Types.ObjectId[];
}

export interface IDirection extends Document {
  crmId?: number;
  nameUzb: string;
  subjects: ISubjectChoice[];
  isActive: boolean;
  lastSyncedAt?: Date;
  createdAt: Date;
}

const SubjectChoiceSchema = new Schema<ISubjectChoice>({
  type: { type: String, enum: ['single', 'choice'], required: true },
  subjectIds: [{ type: Schema.Types.ObjectId, ref: 'Subject' }]
}, { _id: false });

const DirectionSchema = new Schema<IDirection>({
  crmId: { type: Number, sparse: true, unique: true },
  nameUzb: { type: String, required: true },
  subjects: [SubjectChoiceSchema],
  isActive: { type: Boolean, default: true },
  lastSyncedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

DirectionSchema.index({ isActive: 1 });
DirectionSchema.index({ nameUzb: 1 });

export default mongoose.model<IDirection>('Direction', DirectionSchema);
