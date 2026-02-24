import mongoose, { Schema, Document } from 'mongoose';

export interface IBranch extends Document {
  crmId?: number;
  name: string;
  location: string;
  address?: string;
  phone?: string;
  isActive: boolean;
  lastSyncedAt?: Date;
  createdAt: Date;
}

const BranchSchema = new Schema<IBranch>({
  crmId: { type: Number, sparse: true, unique: true },
  name: { type: String, required: true },
  location: { type: String, required: true },
  address: String,
  phone: String,
  isActive: { type: Boolean, default: true },
  lastSyncedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

BranchSchema.index({ isActive: 1 });
BranchSchema.index({ name: 1 });

export default mongoose.model<IBranch>('Branch', BranchSchema);
