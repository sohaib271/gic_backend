import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DepartmentDocument = Department & Document;

@Schema({ timestamps: true })
export class Department {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop()
  code?: string;

  @Prop({enum:["intermediate","bs_adp"],default:null})
  category?:string;
}

export const DepartmentSchema = SchemaFactory.createForClass(Department);
