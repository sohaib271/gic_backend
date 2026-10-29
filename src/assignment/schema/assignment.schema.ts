/**
 * 📚 ASSIGNMENT SCHEMA
 * ====================
 * MongoDB collection: assignments
 *
 * One document per assignment published by a teacher (or HOD) for a class.
 * Files live in GridFS ("assignment_files" bucket) and only their ids plus
 * display metadata are stored here — see AssignmentFileService.
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Class } from 'src/class/schema/class.schema';
import { Department } from 'src/department/schema/department.schema';
import { User } from 'src/user/schema/user.schema';

export type AssignmentDocument = Assignment & Document;

/** A file stored in GridFS, described well enough to render without a lookup. */
@Schema({ _id: false })
export class AssignmentAttachment {
  @Prop({ type: Types.ObjectId, required: true })
  fileId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, default: 'application/octet-stream' })
  mime!: string;

  @Prop({ type: Number, default: 0 })
  size!: number;
}

export const AssignmentAttachmentSchema =
  SchemaFactory.createForClass(AssignmentAttachment);

@Schema({ timestamps: true })
export class Assignment {
  @Prop({ type: Types.ObjectId, ref: Class.name, required: true, index: true })
  classId!: Types.ObjectId;

  /** Snapshot so the list never has to populate the class just to show a name. */
  @Prop({ required: true, trim: true })
  className!: string;

  @Prop({ type: Types.ObjectId, ref: Department.name })
  departmentId?: Types.ObjectId;

  @Prop({ type: Number })
  subjectId?: number;

  @Prop({ trim: true })
  subject?: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ type: [AssignmentAttachmentSchema], default: [] })
  attachments!: AssignmentAttachment[];

  @Prop({ type: Date, required: true })
  dueAt!: Date;

  /** 0 means "no marks set"; grading is still possible but unbounded. */
  @Prop({ type: Number, default: 0, min: 0 })
  maxMarks!: number;

  @Prop({ default: true })
  allowLate!: boolean;

  @Prop({ type: String, enum: ['published', 'closed'], default: 'published' })
  status!: string;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ required: true })
  createdByName!: string;

  @Prop({ type: Types.ObjectId, ref: User.name })
  updatedBy?: Types.ObjectId;
}

export const AssignmentSchema = SchemaFactory.createForClass(Assignment);

AssignmentSchema.index({ classId: 1, createdAt: -1 });
AssignmentSchema.index({ classId: 1, dueAt: 1 });
