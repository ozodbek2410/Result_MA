import mongoose, { Schema, Document } from 'mongoose';

export interface IAnswer {
  questionIndex: number;
  selectedAnswer?: 'A' | 'B' | 'C' | 'D';
  isCorrect: boolean;
  points: number;
  wasEdited?: boolean; // Флаг, что ответ был отредактирован вручную
  originalAnswer?: 'A' | 'B' | 'C' | 'D'; // Оригинальный ответ с фото
}

export interface ITestResult extends Document {
  testId?: mongoose.Types.ObjectId;
  blockTestId?: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  variantId?: mongoose.Types.ObjectId;
  branchId?: mongoose.Types.ObjectId;
  answers: IAnswer[];
  totalPoints: number;
  maxPoints: number;
  percentage: number;
  scannedImagePath?: string;
  scannedAt?: Date;
  createdAt: Date;
}

const AnswerSchema = new Schema<IAnswer>({
  questionIndex: { type: Number, required: true },
  selectedAnswer: { type: String, enum: ['A', 'B', 'C', 'D'] },
  isCorrect: { type: Boolean, required: true },
  points: { type: Number, required: true },
  wasEdited: { type: Boolean, default: false },
  originalAnswer: { type: String, enum: ['A', 'B', 'C', 'D'] }
}, { _id: false });

const TestResultSchema = new Schema<ITestResult>({
  testId: { type: Schema.Types.ObjectId, ref: 'Test' },
  blockTestId: { type: Schema.Types.ObjectId, ref: 'BlockTest' },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  variantId: { type: Schema.Types.ObjectId, ref: 'StudentVariant' },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  answers: [AnswerSchema],
  totalPoints: { type: Number, required: true },
  maxPoints: { type: Number, required: true },
  percentage: { type: Number, required: true },
  scannedImagePath: String,
  scannedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

// Add indexes for faster queries
TestResultSchema.index({ testId: 1 });
TestResultSchema.index({ blockTestId: 1 });
TestResultSchema.index({ studentId: 1 });
TestResultSchema.index({ branchId: 1 });
TestResultSchema.index({ testId: 1, studentId: 1 }); // Compound index for unique results
TestResultSchema.index({ blockTestId: 1, studentId: 1 }); // Compound index
TestResultSchema.index({ createdAt: -1 }); // For sorting

// Send Telegram notification after result saved
TestResultSchema.post('save', async function (doc) {
  try {
    const { TelegramBotService } = await import('../services/telegramBotService');
    const Test = (await import('./Test')).default;
    const BlockTest = (await import('./BlockTest')).default;

    let testName = 'Test';
    if (doc.testId) {
      const test = await Test.findById(doc.testId).select('name').lean();
      if (test) testName = test.name;
    } else if (doc.blockTestId) {
      const bt = await BlockTest.findById(doc.blockTestId).select('periodMonth periodYear classNumber').lean();
      if (bt) testName = `Blok test ${bt.periodMonth}/${bt.periodYear} (${bt.classNumber}-sinf)`;
    }

    const correct = doc.answers.filter((a: IAnswer) => a.isCorrect).length;
    const incorrect = doc.answers.filter((a: IAnswer) => !a.isCorrect && a.selectedAnswer).length;

    await TelegramBotService.sendResultNotification(doc.studentId.toString(), {
      testName,
      totalPoints: doc.totalPoints,
      maxPoints: doc.maxPoints,
      percentage: doc.percentage,
      correct,
      incorrect,
    });
  } catch {
    // Silent fail — notification should not block result saving
  }
});

export default mongoose.model<ITestResult>('TestResult', TestResultSchema);
