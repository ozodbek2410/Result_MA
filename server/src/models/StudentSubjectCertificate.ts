import mongoose, { Schema, Document } from 'mongoose';

export interface IStudentSubjectCertificate extends Document {
  studentId: mongoose.Types.ObjectId;
  subjectId: mongoose.Types.ObjectId;
  branchId: mongoose.Types.ObjectId;
  percentage: number; // 0-100, masalan 80.5
  note?: string;      // ixtiyoriy: "Olimpiada 2025"
  createdAt: Date;
}

const StudentSubjectCertificateSchema = new Schema<IStudentSubjectCertificate>({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  branchId:  { type: Schema.Types.ObjectId, ref: 'Branch',  required: true },
  percentage: { type: Number, required: true, min: 0, max: 100 },
  note:       { type: String },
  createdAt:  { type: Date, default: Date.now },
});

// Bir o'quvchi + bir fan = bitta yozuv (filial bo'yicha emas, global)
StudentSubjectCertificateSchema.index({ studentId: 1, subjectId: 1 }, { unique: true });
StudentSubjectCertificateSchema.index({ branchId: 1 });

export default mongoose.model<IStudentSubjectCertificate>(
  'StudentSubjectCertificate',
  StudentSubjectCertificateSchema
);
