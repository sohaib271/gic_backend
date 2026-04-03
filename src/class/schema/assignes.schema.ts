import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ _id: false })
export class Schedule {
  @Prop({ required: true })
  day!: string;

  @Prop({ required: true })
  startTime!: string;

  @Prop({ required: true })
  endTime!: string;
}

export const ScheduleSchema = SchemaFactory.createForClass(Schedule);

@Schema({ _id: false, timestamps: true })
export class AssignedTeacher {
  @Prop({ type: Types.ObjectId, required: true })
  teacherId!: Types.ObjectId;

  @Prop({ required: true })
  subject?: string;

  @Prop({ type: [ScheduleSchema], default: [] })
  schedule?: Schedule[];
}

export const AssignedTeacherSchema = SchemaFactory.createForClass(AssignedTeacher);