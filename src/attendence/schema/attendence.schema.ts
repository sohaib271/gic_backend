import { Prop, Schema } from "@nestjs/mongoose";
import { Types } from "mongoose";
import { Class } from "src/class/schema/class.schema";
import { User } from "src/user/schema/user.schema";

@Schema({ timestamps: true })
export class Attendance {
  @Prop({ type: Types.ObjectId, ref: Class.name, required: true })
  classId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  studentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  teacherId!: Types.ObjectId;

  @Prop({ required: true })
  isPresent!: boolean;

  @Prop({ required: true })
  date!: Date;

  @Prop()
  lectureNumber?: number; // optional but VERY useful
}