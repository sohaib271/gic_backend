import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LeaveTypeDocument = LeaveType & Document;

@Schema({ timestamps: true })
export class LeaveType {
  @Prop({ required: true, unique: true, trim: true })
  name!: string;

  @Prop({ default: true })
  isActive?: boolean;
}

export const LeaveTypeSchema = SchemaFactory.createForClass(LeaveType);