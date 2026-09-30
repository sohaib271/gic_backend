import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Department } from 'src/department/schema/department.schema';

export type SubjectDocument = Subject & Document;

@Schema({ timestamps: true })
export class Subject {
  // Human-friendly numeric id, handed out from 1 and never reused.
  @Prop({ required: true, unique: true, min: 1 })
  subjectId!: number;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true, uppercase: true })
  code?: string;

  @Prop({ type: Types.ObjectId, ref: Department.name })
  department?: Types.ObjectId;

  @Prop({ enum: ['intermediate', 'bs', 'adp'], default: null })
  category?: string;

  @Prop({ default: true })
  isActive?: boolean;
}

export const SubjectSchema = SchemaFactory.createForClass(Subject);
SubjectSchema.index({ name: 1 });
SubjectSchema.index({ department: 1, category: 1 });
