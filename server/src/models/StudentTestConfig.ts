import mongoose, { Schema, Document } from 'mongoose';

export interface ISubjectConfig {
  subjectId: mongoose.Types.ObjectId;
  questionCount: number;
  groupLetter?: string; // буква группы для этого предмета (A, B, C, D или null)
  isAdditional: boolean; // дополнительный предмет (не из направления)
}

export interface IPointsConfig {
  from: number; // с какого вопроса
  to: number;   // до какого вопроса
  points: number; // баллов за вопрос
}

export interface IStudentTestConfig extends Document {
  studentId: mongoose.Types.ObjectId;
  branchId: mongoose.Types.ObjectId;
  totalQuestions: number; // общее количество вопросов (дефолт 90)
  subjects: ISubjectConfig[];
  pointsConfig: IPointsConfig[];
  createdAt: Date;
  updatedAt: Date;
}

const SubjectConfigSchema = new Schema({
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  questionCount: { type: Number, required: true, min: 1 },
  groupLetter: { type: String, required: false }, // A, B, C, D или null
  isAdditional: { type: Boolean, default: false }
}, { _id: false });

const PointsConfigSchema = new Schema({
  from: { type: Number, required: true, min: 1 },
  to: { type: Number, required: true },
  points: { type: Number, required: true, min: 0 }
}, { _id: false });

const StudentTestConfigSchema = new Schema<IStudentTestConfig>({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, unique: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  totalQuestions: { type: Number, default: 90, min: 1 },
  subjects: [SubjectConfigSchema],
  pointsConfig: [PointsConfigSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Обновляем updatedAt при каждом сохранении
StudentTestConfigSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model<IStudentTestConfig>('StudentTestConfig', StudentTestConfigSchema);
