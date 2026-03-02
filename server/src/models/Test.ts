import mongoose, { Schema, Document } from 'mongoose';

export interface IQuestionVariant {
  letter: 'A' | 'B' | 'C' | 'D';
  text: string;
  formula?: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export interface IMediaItem {
  type: 'image' | 'table';
  url: string;
  position: 'before' | 'after' | 'inline';
}

export interface IQuestion {
  text: string;
  contextText?: string;
  contextImage?: string;
  contextImageWidth?: number;
  contextImageHeight?: number;
  formula?: string;
  imageUrl?: string; // Legacy support
  imageWidth?: number; // Word dagi original kenglik (px)
  imageHeight?: number; // Word dagi original balandlik (px)
  media?: IMediaItem[]; // Yangi format
  variants: IQuestionVariant[];
  correctAnswer?: 'A' | 'B' | 'C' | 'D' | ''; // Необязательно для вопросов без вариантов
  points: number;
  pinned?: boolean; // Aralashtirganda joylashuvi o'zgarmaydi, faqat variantlari aralashadi
}

export interface ITest extends Document {
  branchId: mongoose.Types.ObjectId;
  groupId?: mongoose.Types.ObjectId; // Необязательно для черновиков
  subjectId?: mongoose.Types.ObjectId; // Необязательно для черновиков
  classNumber: number;
  name: string;
  questions: IQuestion[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const QuestionVariantSchema = new Schema<IQuestionVariant>({
  letter: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
  text: { type: String, required: true },
  formula: String,
  imageUrl: String,
  imageWidth: Number,
  imageHeight: Number
}, { _id: false });

const MediaItemSchema = new Schema<IMediaItem>({
  type: { type: String, enum: ['image', 'table'], required: true },
  url: { type: String, required: true },
  position: { type: String, enum: ['before', 'after', 'inline'], default: 'after' }
}, { _id: false });

const QuestionSchema = new Schema<IQuestion>({
  text: { type: String, required: true },
  contextText: String,
  contextImage: String,
  contextImageWidth: Number,
  contextImageHeight: Number,
  formula: String,
  imageUrl: String, // Legacy support
  imageWidth: Number, // Word dagi original kenglik (px)
  imageHeight: Number, // Word dagi original balandlik (px)
  media: [MediaItemSchema], // Yangi format
  variants: [QuestionVariantSchema],
  correctAnswer: { type: String, enum: ['A', 'B', 'C', 'D', ''], required: false }, // Необязательно для вопросов без вариантов
  points: { type: Number, required: true, default: 1 }
}, { _id: false });

const TestSchema = new Schema<ITest>({
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: false }, // Необязательно для черновиков
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: false }, // Необязательно для черновиков
  classNumber: { type: Number, required: true },
  name: { type: String, required: true },
  questions: [QuestionSchema],
  createdBy: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
  createdAt: { type: Date, default: Date.now }
});

// Add indexes for faster queries
TestSchema.index({ branchId: 1 });
TestSchema.index({ groupId: 1 });
TestSchema.index({ createdBy: 1 });
TestSchema.index({ branchId: 1, classNumber: 1 }); // Compound index
TestSchema.index({ createdAt: -1 }); // For sorting

export default mongoose.model<ITest>('Test', TestSchema);
