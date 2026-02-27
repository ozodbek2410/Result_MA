import mongoose, { Schema, Document } from 'mongoose';

export interface IGroupSubjectConfig extends Document {
  groupId: mongoose.Types.ObjectId;
  subjectId: mongoose.Types.ObjectId;
  groupLetter: string; // A, B, C, D, E, F
}

const GroupSubjectConfigSchema = new Schema<IGroupSubjectConfig>({
  groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  groupLetter: { type: String, enum: ['A', 'B', 'C', 'D', 'E', 'F'] },
});

GroupSubjectConfigSchema.index({ groupId: 1 });
GroupSubjectConfigSchema.index({ groupId: 1, subjectId: 1 }, { unique: true });

export default mongoose.model<IGroupSubjectConfig>('GroupSubjectConfig', GroupSubjectConfigSchema);
