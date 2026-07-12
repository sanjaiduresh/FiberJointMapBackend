import { Schema, model, Document } from 'mongoose';

export interface IWire extends Document {
  name: string;
  color: string;
  organizationId: string;
  createdBy: { userId: string; userName: string };
  createdAt: Date;
}

const WireSchema = new Schema<IWire>({
  name: { type: String, required: true },
  color: { type: String, required: true, default: '#3b82f6' },
  organizationId: { type: String, required: true, index: true },
  createdBy: {
    userId: { type: String, required: true },
    userName: { type: String, required: true },
  },
  createdAt: { type: Date, default: Date.now },
});

// Unique name per organization
WireSchema.index({ name: 1, organizationId: 1 }, { unique: true });

export default model<IWire>('Wire', WireSchema);
