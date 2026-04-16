import mongoose, { Schema, Document } from 'mongoose';

export enum AssignmentSource {
  CRM_SYNC = 'CRM_SYNC',
  MANUAL = 'MANUAL',
  MIGRATION = 'MIGRATION',
}

export interface ITeacherGroupAssignment extends Document {
  teacherId: mongoose.Types.ObjectId;
  groupId: mongoose.Types.ObjectId;
  subjectId: mongoose.Types.ObjectId;
  crmGroupId?: number;
  source: AssignmentSource;
  isManualOverride: boolean;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  deactivatedAt?: Date;
  deactivatedBy?: mongoose.Types.ObjectId;
  deactivatedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TeacherGroupAssignmentSchema = new Schema<ITeacherGroupAssignment>(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    crmGroupId: { type: Number },
    source: {
      type: String,
      enum: Object.values(AssignmentSource),
      required: true,
      default: AssignmentSource.CRM_SYNC,
    },
    isManualOverride: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deactivatedAt: { type: Date },
    deactivatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deactivatedReason: { type: String },
  },
  { timestamps: true }
);

TeacherGroupAssignmentSchema.index(
  { teacherId: 1, groupId: 1, subjectId: 1 },
  { unique: true }
);
TeacherGroupAssignmentSchema.index({ teacherId: 1, isActive: 1 });
TeacherGroupAssignmentSchema.index({ groupId: 1, subjectId: 1, isActive: 1 });
TeacherGroupAssignmentSchema.index({ crmGroupId: 1 });

export default mongoose.model<ITeacherGroupAssignment>(
  'TeacherGroupAssignment',
  TeacherGroupAssignmentSchema
);
