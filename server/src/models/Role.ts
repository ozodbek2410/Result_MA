import mongoose, { Schema, Document } from 'mongoose';

export interface IRole extends Document {
  name: string;
  displayName: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  permissions: [{
    type: String,
    trim: true
  }],
  isSystem: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Prevent deletion of system roles
RoleSchema.pre('deleteOne', { document: true, query: false }, function(next) {
  if (this.isSystem) {
    next(new Error('Cannot delete system role'));
  } else {
    next();
  }
});

export default mongoose.model<IRole>('Role', RoleSchema);
