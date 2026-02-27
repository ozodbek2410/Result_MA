import mongoose, { Schema, Document } from 'mongoose';

export interface IUpload extends Document {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  path: string;
  uploadedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const UploadSchema = new Schema<IUpload>({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
  path: { type: String, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

// Add indexes for faster queries
UploadSchema.index({ uploadedBy: 1 });
UploadSchema.index({ createdAt: -1 });
UploadSchema.index({ filename: 1 });

export default mongoose.model<IUpload>('Upload', UploadSchema);
