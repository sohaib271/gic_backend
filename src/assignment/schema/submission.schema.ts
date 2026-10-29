/**
 * 📝 SUBMISSION SCHEMA
 * ====================
 * MongoDB collection: submissions
 *
 * One document per (assignment, student). Students may resubmit — the same
 * document is updated and any previous grade is cleared so the teacher grades
 * the new version. The unique index makes that safe under concurrent taps.
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  Assignment,
  AssignmentAttachment,
  AssignmentAttachmentSchema,
} from './assignment.schema';
import { User } from 'src/user/schema/user.schema';

export type SubmissionDocument = Submission & Document;

@Schema({ timestamps: true })
export class Submission {
  @Prop({
    type: Types.ObjectId,
    ref: Assignment.name,
    required: true,
    index: true,
  })
  assignment!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  student!: Types.ObjectId;

  /** Optional written answer — a submission can be files, text, or both. */
  @Prop({ default: '' })
  note!: string;

  @Prop({ type: [AssignmentAttachmentSchema], default: [] })
  files!: AssignmentAttachment[];

  @Prop({ type: Date, required: true })
  submittedAt!: Date;

  @Prop({ default: false })
  isLate!: boolean;

  @Prop({ type: Number, default: null })
  marks?: number | null;

  @Prop({ default: '' })
  feedback?: string;

  @Prop({ type: Types.ObjectId, ref: User.name })
  gradedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  gradedAt?: Date | null;
}

export const SubmissionSchema = SchemaFactory.createForClass(Submission);

// One submission per student per assignment; resubmits update this document.
SubmissionSchema.index({ assignment: 1, student: 1 }, { unique: true });
SubmissionSchema.index({ student: 1, submittedAt: -1 });
