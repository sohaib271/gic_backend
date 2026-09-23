import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from 'src/user/schema/user.schema';

export type SurveyDocument = Survey & Document;

export enum SurveyStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum QuestionType {
  TEXT = 'text',
  SINGLE = 'single',
  MULTIPLE = 'multiple',
}

export class Question {
  @Prop({ required: true })
  question!: string;

  @Prop({ required: true, enum: QuestionType, default: QuestionType.TEXT })
  type!: QuestionType;

  @Prop({ type: [String], default: [] })
  options!: string[];

  @Prop({ default: false })
  required!: boolean;
}

@Schema({ timestamps: true })
export class Survey {
  @Prop({ required: true })
  title!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ type: [Question], required: true })
  questions!: Question[];

  @Prop({ type: [String], required: true })
  classNames!: string[];

  @Prop({ enum: ['intermediate', 'bs', 'adp'], default: null })
  category?: string;

  @Prop({ enum: SurveyStatus, default: SurveyStatus.ACTIVE })
  status!: SurveyStatus;

  @Prop({ required: true, enum: ['admin', 'hod', 'proff'] })
  creatorRole!: string;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  createdBy!: Types.ObjectId;
}

export const SurveySchema = SchemaFactory.createForClass(Survey);
SurveySchema.index({ classNames: 1 });
SurveySchema.index({ status: 1 });
SurveySchema.index({ createdAt: -1 });