
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ _id: false,timestamps:true })
export class AssignedTeacher {
  @Prop({ type: Types.ObjectId, required: true })
  teacherId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  subject: string;
}

export const AssignedTeacherSchema =
  SchemaFactory.createForClass(AssignedTeacher);
