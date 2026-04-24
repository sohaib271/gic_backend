import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";
import { Class } from "src/class/schema/class.schema";
import { User } from "src/user/schema/user.schema";

export type AttendenceDocument = Attendance & Document;

@Schema({ timestamps: true })
export class Attendance {
  @Prop({ type: Types.ObjectId, ref: Class.name, required: true })
  classId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  studentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  teacherId!: Types.ObjectId;

  @Prop({ required: true,enum:["A","P","L"]})
  attendenceStatus!: string;

  @Prop({ required: true })
  date!: Date;

  @Prop()
  lectureNumber?: number;
}

export const AttendenceSchema = SchemaFactory.createForClass(Attendance);
