import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RemarkDocument = Remark & Document;

export enum RemarkEntityType {
  STUDENT = 'student',
  CLASS = 'class',
  TEACHER = 'teacher',
  DEPARTMENT = 'department',
  GENERAL = 'general',
}

@Schema({ timestamps: true })
export class Remark {
  @Prop({ required: true })
  entityType!: RemarkEntityType;

  @Prop({ type: Types.ObjectId, required: true })
  entityId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId!: Types.ObjectId;

  @Prop({ required: true })
  authorName!: string;

  @Prop({ required: true })
  authorRole!: string;

  @Prop({ default: '' })
  text!: string;

  @Prop({ default: null })
  attachmentUrl?: string;

  @Prop({ default: null })
  attachmentType?: 'image' | 'file';

  @Prop({ default: null })
  attachmentName?: string;
}

export const RemarkSchema = SchemaFactory.createForClass(Remark);

// Indexes for efficient queries
RemarkSchema.index({ entityType: 1, entityId: 1 });
RemarkSchema.index({ authorId: 1 });
RemarkSchema.index({ createdAt: -1 });