import { Schema, model, Document } from 'mongoose';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PENDING_EDIT' | 'PENDING_DELETE';

export interface IJointPhoto {
  url: string;
  publicId: string;
  uploadedAt: Date;
}

export interface IFiberJoint extends Document {
  label: string;
  notes: string;
  jointType: 'Base' | 'Main' | 'Sub' | 'Splice';
  cableType: 'Single Mode' | 'Multi Mode';
  fiberCount: number;
  lat: number;
  lng: number;
  organizationId: string;
  createdBy: { userId: string; userName: string };
  approvalStatus: ApprovalStatus;
  pendingEdits?: Partial<IFiberJoint>;
  photos: IJointPhoto[];
  createdAt: Date;
}

const FiberJointSchema = new Schema<IFiberJoint>({
  label: { type: String, required: true },
  notes: { type: String, default: '' },
  jointType: {
    type: String,
    enum: ['Base', 'Main', 'Sub', 'Splice'],
    default: 'Main',
  },
  cableType: { type: String, enum: ['Single Mode', 'Multi Mode'], default: 'Single Mode' },
  fiberCount: { type: Number, default: 12 },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  organizationId: { type: String, required: true, index: true },
  createdBy: {
    userId: { type: String, default: '' },
    userName: { type: String, default: 'Unknown' },
  },
  approvalStatus: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'PENDING_EDIT', 'PENDING_DELETE'],
    default: 'APPROVED',
  },
  pendingEdits: { type: Schema.Types.Mixed, default: null },
  photos: [{
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  }],
  createdAt: { type: Date, default: Date.now },
});

export default model<IFiberJoint>('FiberJoint', FiberJointSchema);