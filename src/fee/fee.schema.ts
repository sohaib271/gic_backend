import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FeeDocument = Fee & Document;

export enum FeeStatusEnum {
  PENDING = 'pending',
  PAID = 'paid',
  WAIVED = 'waived',
}

@Schema({ timestamps: true })
export class Fee {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  studentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Class', index: true })
  classId?: Types.ObjectId;

  @Prop()
  className?: string;

  @Prop({ type: Types.ObjectId, ref: 'Department', index: true })
  departmentId?: Types.ObjectId;

  @Prop({ required: true })
  month: string;

  @Prop({ required: true })
  year: number;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, enum: FeeStatusEnum, default: FeeStatusEnum.PENDING, index: true })
  status: FeeStatusEnum;

  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ type: Date })
  paidDate?: Date;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  category: string;

  @Prop({ default: '' })
  semester: string;

  @Prop({ default: '' })
  class: string;

  @Prop({ type: [Object], default: [] })
  customFields: Record<string, any>[];
}

export const FeeSchema = SchemaFactory.createForClass(Fee);
FeeSchema.index({ studentId: 1, status: 1 });
FeeSchema.index({ studentId: 1, year: 1, month: 1 });
FeeSchema.index({ departmentId: 1, status: 1 });