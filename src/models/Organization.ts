import { Schema, model, Document } from 'mongoose';

export interface IOrganization extends Document {
  name: string;
  createdBy: string; // userId of the owner who created it
  adminId?: string; // userId of the ADMIN who manages this org
  createdAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>({
  name: { type: String, required: true, trim: true },
  createdBy: { type: String, required: true },
  adminId: { type: String, index: true },
  createdAt: { type: Date, default: Date.now },
});

export default model<IOrganization>('Organization', OrganizationSchema);
