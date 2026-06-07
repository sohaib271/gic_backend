// src/users/schemas/user.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {Location, LocationSchema} from './location';
import { User } from 'src/user/schema/user.schema';

export type TeacherAttendanceDocument = TeacherAttendance & Document;

@Schema({ timestamps: true })
export class TeacherAttendance {

  @Prop({ type: Types.ObjectId,ref:User.name, required: true })
  teacherId!: Types.ObjectId;

  @Prop({required:true,type:LocationSchema})
  gps!:Location;

  @Prop({default:Date.now()})
  currentDate?:Date;
  
  @Prop({required:true,enum:["check-in","check-out"]})
  type!:string;

}

export const TeacherAttendanceSchema = SchemaFactory.createForClass(TeacherAttendance);
TeacherAttendanceSchema.index({ currentDate: 1 });
TeacherAttendanceSchema.index({ teacherId: 1 });

