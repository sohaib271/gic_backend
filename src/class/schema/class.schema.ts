// src/users/schemas/user.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AssignedTeacher, AssignedTeacherSchema } from './assignes.schema';
import { User } from 'src/user/schema/user.schema';
import { Department } from 'src/department/schema/department.schema';

export type ClassDocument = Class & Document;

@Schema({ timestamps: true })
export class Class {

  @Prop({ required: true, unique: true })
  className: string;

  @Prop({type: Types.ObjectId, ref: User.name,required:true })
  createdBy:Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Department.name,required:true })
  departmentId:Types.ObjectId;

  @Prop({ required: true })
  departmentName:string;

  @Prop({type:[{ type: Types.ObjectId, ref: User.name}],default:[]})
  classStudents:Types.ObjectId[];

  @Prop([AssignedTeacherSchema])
  assignes:AssignedTeacher[];

  @Prop([String])
  subjects?: string[];

  @Prop({required:true})
  session: string;

   @Prop()
  semester?: string;

  @Prop({enum:["I","II"]})
  inter?: string;
}

export const ClassSchema = SchemaFactory.createForClass(Class);
