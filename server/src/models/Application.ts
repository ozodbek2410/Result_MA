import mongoose, { Schema, Document } from 'mongoose';

export interface IApplication extends Document {
  fullName: string;
  phone: string;
  grade: string;
  status: 'pending' | 'contacted' | 'accepted' | 'rejected';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ApplicationSchema = new Schema<IApplication>(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    grade: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'contacted', 'accepted', 'rejected'],
      default: 'pending',
      required: true,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
ApplicationSchema.index({ status: 1 });
ApplicationSchema.index({ createdAt: -1 });

const Application = mongoose.model<IApplication>('Application', ApplicationSchema);

export default Application;
