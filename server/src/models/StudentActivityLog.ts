import mongoose, { Schema, Document } from 'mongoose';

export interface IStudentActivityLog extends Document {
  studentId: mongoose.Types.ObjectId;
  activityType: 'group_added' | 'group_removed' | 'subject_added' | 'subject_removed' | 'profile_updated' | 'test_assigned' | 'grade_updated';
  title: string;
  description: string;
  metadata?: {
    groupId?: mongoose.Types.ObjectId;
    groupName?: string;
    subjectId?: mongoose.Types.ObjectId;
    subjectName?: string;
    oldValue?: any;
    newValue?: any;
  };
  performedBy?: mongoose.Types.ObjectId;
  isRead: boolean;
  createdAt: Date;
}

const StudentActivityLogSchema = new Schema<IStudentActivityLog>({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  activityType: { 
    type: String, 
    enum: ['group_added', 'group_removed', 'subject_added', 'subject_removed', 'profile_updated', 'test_assigned', 'grade_updated'],
    required: true 
  },
  title: { type: String, required: true },
  description: { type: String, required: true },
  metadata: {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group' },
    groupName: String,
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
    subjectName: String,
    oldValue: Schema.Types.Mixed,
    newValue: Schema.Types.Mixed
  },
  performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Indexes
StudentActivityLogSchema.index({ studentId: 1, createdAt: -1 });
StudentActivityLogSchema.index({ studentId: 1, isRead: 1 });

export default mongoose.model<IStudentActivityLog>('StudentActivityLog', StudentActivityLogSchema);
