import { Schema, model, Document, Types } from 'mongoose';

export interface ISegment extends Document {
  fromJointId: Types.ObjectId;
  toJointId: Types.ObjectId;
  waypoints: Array<{ lat: number; lng: number }>;
  cableType: 'Single Mode' | 'Multi Mode';
  fiberCount: number;
  lengthMeters: number;
  userId: string;
  createdBy: { userId: string; userName: string };
  createdAt: Date;
}

const SegmentSchema = new Schema<ISegment>({
  fromJointId: { type: Schema.Types.ObjectId, ref: 'FiberJoint', required: true },
  toJointId: { type: Schema.Types.ObjectId, ref: 'FiberJoint', required: true },
  waypoints: {
    type: [{ lat: { type: Number, required: true }, lng: { type: Number, required: true } }],
    default: [],
  },
  cableType: { type: String, enum: ['Single Mode', 'Multi Mode'], required: true },
  fiberCount: { type: Number, required: true },
  lengthMeters: { type: Number, required: true },
  userId: { type: String, required: true, index: true },
  createdBy: {
    userId: { type: String, required: true },
    userName: { type: String, required: true },
  },
  createdAt: { type: Date, default: Date.now },
});

export default model<ISegment>('Segment', SegmentSchema);
