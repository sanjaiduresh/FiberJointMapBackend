import { Schema, model, Document, Types } from 'mongoose';

export interface ICut extends Document {
  lat: number;
  lng: number;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  description: string;
  status: 'Cut' | 'Fixed';
  segmentId: Types.ObjectId;
  markedBy: { userId: string; userName: string };
  fixedBy?: { userId: string; userName: string };
  fixedAt?: Date;
  createdAt: Date;
}

const CutSchema = new Schema<ICut>({
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  severity: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], required: true },
  description: { type: String, default: '' },
  status: { type: String, enum: ['Cut', 'Fixed'], default: 'Cut' },
  segmentId: { type: Schema.Types.ObjectId, ref: 'Segment', required: true },
  markedBy: {
    userId: { type: String, required: true },
    userName: { type: String, required: true },
  },
  fixedBy: {
    userId: { type: String },
    userName: { type: String },
  },
  fixedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

export default model<ICut>('Cut', CutSchema);
