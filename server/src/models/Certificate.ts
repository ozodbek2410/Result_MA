import mongoose, { Schema, Document } from 'mongoose';

export interface ICertificate extends Document {
  studentId: mongoose.Types.ObjectId;
  blockTestId?: mongoose.Types.ObjectId;
  testId?: mongoose.Types.ObjectId;
  testResultId: mongoose.Types.ObjectId;
  branchId: mongoose.Types.ObjectId;
  percentage: number;          // o'quvchi olgan foiz
  threshold: number;           // talab qilingan minimal foiz
  certificateCode: string;     // unikal kod (QR uchun)
  pdfPath?: string;
  issuedAt: Date;
}

const CertificateSchema = new Schema<ICertificate>({
  studentId:     { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  blockTestId:   { type: Schema.Types.ObjectId, ref: 'BlockTest' },
  testId:        { type: Schema.Types.ObjectId, ref: 'Test' },
  testResultId:  { type: Schema.Types.ObjectId, ref: 'TestResult', required: true },
  branchId:      { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  percentage:    { type: Number, required: true },
  threshold:     { type: Number, required: true },
  certificateCode: { type: String, required: true, unique: true },
  pdfPath:       { type: String },
  issuedAt:      { type: Date, default: Date.now },
});

CertificateSchema.index({ studentId: 1 });
CertificateSchema.index({ blockTestId: 1 });
CertificateSchema.index({ testId: 1 });
CertificateSchema.index({ branchId: 1 });
CertificateSchema.index({ certificateCode: 1 }, { unique: true });

export default mongoose.model<ICertificate>('Certificate', CertificateSchema);
