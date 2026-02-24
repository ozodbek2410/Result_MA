import mongoose, { Schema, Document } from 'mongoose';

export interface ISyncResult {
  branches: { created: number; updated: number; deactivated: number };
  subjects: { created: number; updated: number };
  directions: { created: number; updated: number };
  teachers: { created: number; updated: number };
  groups: { created: number; updated: number; deactivated: number };
  students: { created: number; updated: number; deactivated: number };
  duration: number;
  syncErrors: string[];
}

export interface ISyncLog extends Document {
  type: 'full' | 'manual' | 'scheduled';
  status: 'running' | 'completed' | 'failed';
  result?: ISyncResult;
  startedAt: Date;
  completedAt?: Date;
  triggeredBy?: mongoose.Types.ObjectId;
  error?: string;
}

const SyncResultSchema = new Schema<ISyncResult>({
  branches: {
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    deactivated: { type: Number, default: 0 },
  },
  subjects: {
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
  },
  directions: {
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
  },
  teachers: {
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
  },
  groups: {
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    deactivated: { type: Number, default: 0 },
  },
  students: {
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    deactivated: { type: Number, default: 0 },
  },
  duration: { type: Number, default: 0 },
  syncErrors: [String],
}, { _id: false });

const SyncLogSchema = new Schema<ISyncLog>({
  type: { type: String, enum: ['full', 'manual', 'scheduled'], required: true },
  status: { type: String, enum: ['running', 'completed', 'failed'], required: true },
  result: SyncResultSchema,
  startedAt: { type: Date, required: true },
  completedAt: Date,
  triggeredBy: { type: Schema.Types.ObjectId, ref: 'User' },
  error: String,
});

SyncLogSchema.index({ status: 1 });
SyncLogSchema.index({ startedAt: -1 });

export default mongoose.model<ISyncLog>('SyncLog', SyncLogSchema);
