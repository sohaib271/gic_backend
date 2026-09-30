import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { User } from 'src/user/schema/user.schema';

@Schema({ _id: false })
export class Schedule {
  @Prop({ required: true })
  day!: string;

  @Prop({ required: true })
  startTime!: string;

  @Prop({ required: true })
  endTime!: string;

  // Period number within the day (1 = first lecture). Optional at the storage
  // level because schedules created before this field existed have no value;
  // new schedules require it via ScheduleEntryDto.
  @Prop({ min: 1 })
  lectureNumber?: number;

  // Subject covered by this specific lecture. A teacher assigned to a class
  // with two subjects can teach Maths in period 1 and Physics in period 2.
  @Prop({ min: 1 })
  subjectId?: number;

  // Subject name snapshot, kept for schedules created before Subject existed.
  @Prop()
  subject?: string;
}

export const ScheduleSchema = SchemaFactory.createForClass(Schedule);

@Schema({ _id: false, timestamps: true })
export class AssignedTeacher {
  @Prop({ type: Types.ObjectId,ref:User.name, required: true })
  teacherId!: Types.ObjectId;

  @Prop()
  subjectId?: number;

  @Prop()
  subject?: string;

  @Prop({ type: [ScheduleSchema], default: [] })
  schedule?: Schedule[];
}

export const AssignedTeacherSchema = SchemaFactory.createForClass(AssignedTeacher);