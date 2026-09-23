import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import { Survey } from './survey.schema';
import { User } from 'src/user/schema/user.schema';

export type SurveyResponseDocument = SurveyResponse & Document;

export class SurveyAnswer {
  @Prop({ required: true })
  questionIndex!: number;

  @Prop({ required: true })
  question!: string;

  @Prop({ required: true })
  type!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  answer!: string | string[];
}

@Schema({ timestamps: true })
export class SurveyResponse {
  @Prop({ type: Types.ObjectId, ref: Survey.name, required: true })
  survey!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  student!: Types.ObjectId;

  @Prop({ type: [SurveyAnswer], required: true })
  answers!: SurveyAnswer[];
}

export const SurveyResponseSchema = SchemaFactory.createForClass(SurveyResponse);
SurveyResponseSchema.index({ survey: 1, student: 1 }, { unique: true });
SurveyResponseSchema.index({ survey: 1 });