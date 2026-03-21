import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ _id: false,timestamps:true })
export class AssignedTeacher {
  @Prop({ type: Types.ObjectId, required: true })
  teacherId: Types.ObjectId;

   @Prop([String])
  days?: string[];

  @Prop({default:null})
  startTime?:string;

  @Prop({default:null})
  endTime?:string

  @Prop({ default:null })
  subject?: string;
}

export const AssignedTeacherSchema =
  SchemaFactory.createForClass(AssignedTeacher);
