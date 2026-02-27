import mongoose, { Schema, Document } from 'mongoose';

export interface IStudentVariant extends Document {
  testId: mongoose.Types.ObjectId;
  testType: 'Test' | 'BlockTest';
  studentId: mongoose.Types.ObjectId;
  variantCode: string;
  qrPayload: string;
  questionOrder: number[];
  shuffledQuestions?: any[]; // Вопросы с перемешанными вариантами ответов
  createdAt: Date;
}

const StudentVariantSchema = new Schema<IStudentVariant>({
  testId: { type: Schema.Types.ObjectId, refPath: 'testType', required: true },
  testType: { type: String, enum: ['Test', 'BlockTest'], default: 'Test' },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  variantCode: { type: String, required: true },
  qrPayload: { type: String, required: true },
  questionOrder: [{ type: Number }],
  shuffledQuestions: [{ type: Schema.Types.Mixed }],
  createdAt: { type: Date, default: Date.now }
});

// Add indexes for faster queries
StudentVariantSchema.index({ testId: 1 });
StudentVariantSchema.index({ studentId: 1 });
StudentVariantSchema.index({ variantCode: 1 });
StudentVariantSchema.index({ testId: 1, studentId: 1 }); // Compound index

export default mongoose.model<IStudentVariant>('StudentVariant', StudentVariantSchema);
