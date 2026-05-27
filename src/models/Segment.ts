import { Schema, model, Document, Types } from 'mongoose';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ISegment extends Document {
  fromJointId: Types.ObjectId;
  toJointId: Types.ObjectId;
  waypoints: Array<{ lat: number; lng: number }>;
  cableType: 'Single Mode' | 'Multi Mode';
  fiberCount: number;
  lengthMeters: number;
  organizationId: string;
  createdBy: { userId: string; userName: string };
  approvalStatus: ApprovalStatus;
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
  organizationId: { type: String, required: true, index: true },
  createdBy: {
    userId: { type: String, required: true },
    userName: { type: String, required: true },
  },
  approvalStatus: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'APPROVED',
  },
  createdAt: { type: Date, default: Date.now },
});

export default model<ISegment>('Segment', SegmentSchema);
