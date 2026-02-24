import mongoose, { Schema, Document } from 'mongoose';

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  FIL_ADMIN = 'FIL_ADMIN',
  TEACHER = 'TEACHER',
  METHODIST = 'METHODIST',
  STUDENT = 'STUDENT'
}

export interface IUser extends Document {
  crmId?: number;
  username: string;
  password: string;
  fullName?: string;
  phone?: string;
  phone2?: string;
  parentPhone?: string;
  birthDate?: Date;
  gender?: 'male' | 'female';
  role: string;
  branchId?: mongoose.Types.ObjectId;
  customRoleId?: mongoose.Types.ObjectId;
  teacherSubjects?: mongoose.Types.ObjectId[];
  tgChatId?: string;
  isActive: boolean;
  lastSyncedAt?: Date;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  crmId: { type: Number, sparse: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: String,
  phone: String,
  phone2: String,
  parentPhone: String,
  birthDate: Date,
  gender: { type: String, enum: ['male', 'female'] },
  role: { type: String, required: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  customRoleId: { type: Schema.Types.ObjectId, ref: 'CustomRole' },
  teacherSubjects: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
  tgChatId: String,
  isActive: { type: Boolean, default: true },
  lastSyncedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

UserSchema.index({ branchId: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ customRoleId: 1 });

export default mongoose.model<IUser>('User', UserSchema);
