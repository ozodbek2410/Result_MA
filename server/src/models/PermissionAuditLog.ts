import mongoose, { Schema, Document } from 'mongoose';

export interface IPermissionAuditLog extends Document {
  userId: mongoose.Types.ObjectId;
  username: string;
  role: string;
  action: string; // e.g. 'test.create', 'blockTest.update', 'group.read'
  resourceType: 'subject' | 'group' | 'groupSubject';
  resourceIds: string[]; // e.g. [subjectId] or [groupId, subjectId]
  outcome: 'allowed' | 'denied';
  reason?: string;
  method?: string;
  path?: string;
  createdAt: Date;
}

const PermissionAuditLogSchema = new Schema<IPermissionAuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    role: { type: String, required: true },
    action: { type: String, required: true },
    resourceType: {
      type: String,
      enum: ['subject', 'group', 'groupSubject'],
      required: true,
    },
    resourceIds: [{ type: String }],
    outcome: { type: String, enum: ['allowed', 'denied'], required: true },
    reason: { type: String },
    method: { type: String },
    path: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PermissionAuditLogSchema.index({ userId: 1, createdAt: -1 });
PermissionAuditLogSchema.index({ outcome: 1, createdAt: -1 });
PermissionAuditLogSchema.index({ createdAt: -1 });

// TTL: auto-purge after 90 days to keep collection bounded
PermissionAuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export default mongoose.model<IPermissionAuditLog>(
  'PermissionAuditLog',
  PermissionAuditLogSchema
);
