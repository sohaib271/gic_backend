import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ _id: false,timestamps:true })
export class AssignedTeacher {
  @Prop({ type: Types.ObjectId, required: true })
  teacherId: Types.ObjectId;

  @Prop({default:null})
  day?:string;

  @Prop({default:null})
  startTime?:string;

  @Prop({default:null})
  endTime?:string

  @Prop({ required: true })
  subject: string;
}

export const AssignedTeacherSchema =
  SchemaFactory.createForClass(AssignedTeacher);
