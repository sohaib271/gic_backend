import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SettingDocument = Setting & Document;

@Schema({ timestamps: true })
export class Setting {
  @Prop({ required: true })
  key!: string;

  @Prop({ type: Object, default: null })
  value?: any;

  // null = global (all departments), set = department-specific override
  @Prop({ type: Types.ObjectId, ref: 'Department', default: null })
  departmentId?: Types.ObjectId | null;
}

export const SettingSchema = SchemaFactory.createForClass(Setting);

// Unique constraint: one row per (key, departmentId) pair.
// Global settings have departmentId = null.
SettingSchema.index({ key: 1, departmentId: 1 }, { unique: true });