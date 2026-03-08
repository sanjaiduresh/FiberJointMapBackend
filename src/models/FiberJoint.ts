import { Schema, model, Document } from 'mongoose';

export interface IFiberJoint extends Document {
  label: string;
  notes: string;
  lat: number;
  lng: number;
  createdAt: Date;
}

const FiberJointSchema = new Schema<IFiberJoint>({
  label: { type: String, required: true },
  notes: { type: String, default: '' },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default model<IFiberJoint>('FiberJoint', FiberJointSchema);
