import { Schema, model, Document } from 'mongoose';

export interface IFiberJoint extends Document {
  label: string;
  notes: string;
  cableType: 'Single Mode' | 'Multi Mode';
  fiberCount: number;
  lat: number;
  lng: number;
  createdBy: { userId: string; userName: string };
  createdAt: Date;
}

const FiberJointSchema = new Schema<IFiberJoint>({
  label: { type: String, required: true },
  notes: { type: String, default: '' },
  cableType: { type: String, enum: ['Single Mode', 'Multi Mode'], default: 'Single Mode' },
  fiberCount: { type: Number, default: 12 },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  createdBy: {
    userId: { type: String, default: '' },
    userName: { type: String, default: 'Unknown' },
  },
  createdAt: { type: Date, default: Date.now },
});

export default model<IFiberJoint>('FiberJoint', FiberJointSchema);
