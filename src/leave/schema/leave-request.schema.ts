/**
 * LEAVE REQUEST SCHEMA
 * ====================
 * MongoDB collection: leaverequests
 *
 * Flow: student applies -> HOD of the student's department is notified ->
 * HOD approves/rejects -> student is notified with the new status.
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { LeaveType } from 'src/leave-types/schema/leave-type.schema';

export type LeaveRequestDocument = LeaveRequest & Document;

export enum LeaveStatusEnum {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

/** Full day or half day leave. */
export enum LeaveDayPartEnum {
  FULL = 'full',
  HALF = 'half',
}

@Schema({ timestamps: true })
export class LeaveRequest {
  // ============================================================
  // APPLICANT
  // ============================================================

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId!: Types.ObjectId;

  /**
   * Name/specialId/department are snapshotted at apply time so the HOD list
   * renders without a second query and stays readable even if the student
   * record is later edited.
   */
  @Prop({ required: true })
  studentName!: string;

  @Prop({ default: '' })
  studentSpecialId?: string;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null })
  department?: Types.ObjectId | null;

  // ============================================================
  // LEAVE DETAILS
  // ============================================================

  @Prop({ type: Types.ObjectId, ref: LeaveType.name, required: true })
  leaveType!: Types.ObjectId;

  @Prop({ required: true })
  leaveTypeName!: string;

  @Prop({ required: true })
  fromDate!: Date;

  @Prop({ required: true })
  toDate!: Date;

  @Prop({ default: LeaveDayPartEnum.FULL, enum: Object.values(LeaveDayPartEnum) })
  dayPart!: string;

  /** Pre-computed on apply: 1 = single full day, 0.5 = half day, 3 = three full days. */
  @Prop({ required: true })
  totalDays!: number;

  @Prop({ required: true, trim: true })
  reason!: string;

  /** Where the student can be reached while on leave. */
  @Prop({ type: String, default: null, trim: true })
  contactNumber?: string | null;

  // ============================================================
  // WORKFLOW
  // ============================================================

  @Prop({
    default: LeaveStatusEnum.PENDING,
    enum: Object.values(LeaveStatusEnum),
  })
  status!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reviewedBy?: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  reviewedByName?: string | null;

  @Prop({ type: Date, default: null })
  reviewedAt?: Date | null;

  /** HOD's reason for rejecting (also allows an optional note on approval). */
  @Prop({ type: String, default: null, trim: true })
  decisionNote?: string | null;

  @Prop({ type: Date, default: null })
  cancelledAt?: Date | null;
}

export const LeaveRequestSchema =
  SchemaFactory.createForClass(LeaveRequest);

// "my_leaves" for a student
LeaveRequestSchema.index({ studentId: 1, createdAt: -1 });

// HOD department inbox: filter by status, newest first
LeaveRequestSchema.index({ department: 1, status: 1, createdAt: -1 });

// Overlap detection when applying
LeaveRequestSchema.index({ studentId: 1, status: 1, fromDate: 1, toDate: 1 });
