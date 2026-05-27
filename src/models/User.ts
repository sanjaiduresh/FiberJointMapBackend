import { Schema, model, Document } from 'mongoose';

export type UserRole = 'ADMIN' | 'OWNER' | 'EMPLOYEE';

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  organizationId?: string;
  role: UserRole;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  organizationId: { 
    type: String, 
    required: function(this: any) { return this.role !== 'ADMIN'; }, 
    index: true 
  },
  role: { type: String, enum: ['ADMIN', 'OWNER', 'EMPLOYEE'], default: 'EMPLOYEE' },
  createdAt: { type: Date, default: Date.now },
});

export default model<IUser>('User', UserSchema);
