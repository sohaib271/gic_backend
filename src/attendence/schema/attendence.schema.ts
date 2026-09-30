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

  // Period number within the day. Required because without it a teacher who
  // teaches the same class in two periods gets blocked from marking the second
  // one, and "days present" becomes unanswerable.
  @Prop({ required: true, min: 1 })
  lectureNumber!: number;

  // Subject taught during this lecture, so attendance can be reported
  // subject-wise and not just class-wise.
  @Prop({ min: 1 })
  subjectId?: number;
}

export const AttendenceSchema = SchemaFactory.createForClass(Attendance);
AttendenceSchema.index({ teacherId: 1, classId: 1, date: -1 });
AttendenceSchema.index({ classId: 1, studentId: 1 });

// One record per student per period. studentId must be part of the key:
// without it the index collapses a whole class into a single record, so only
// the first student marked could ever be saved and the rest hit E11000.
//
// The partial filter keeps pre-lectureNumber records out of the index so the
// legacy data can be backfilled in place instead of colliding on the way.
AttendenceSchema.index(
  {
    classId: 1,
    teacherId: 1,
    date: 1,
    lectureNumber: 1,
    studentId: 1,
  },
  { unique: true, partialFilterExpression: { lectureNumber: { $type: 'number' } } },
);
