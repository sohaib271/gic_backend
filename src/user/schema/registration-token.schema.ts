import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RegistrationTokenDocument = RegistrationToken & Document;

/**
 * A shareable link a HOD/admin generates so students of one specific
 * department/program can self-register. The token carries the department,
 * category and class so a student cannot pick the wrong programme, and it can
 * be revoked or expired once the intake is closed.
 */
@Schema({ timestamps: true })
export class RegistrationToken {
  @Prop({ required: true, unique: true, index: true })
  token!: string;

  @Prop({ type: Types.ObjectId, ref: 'Department', required: true })
  department!: Types.ObjectId;

  // "intermediate" | "bs" | "adp" — mirrors User.category. A null category
  // means the token accepts the whole department.
  @Prop({ enum: ['intermediate', 'bs', 'adp', null], default: null })
  category?: string | null;

  // Locks the student to one class/semester. null = any class allowed.
  @Prop({ default: null })
  class?: string | null;

  @Prop({ default: '2022-2026' })
  session!: string;

  // Hard cap so a leaked link cannot be used to flood the database.
  @Prop({ default: 100 })
  maxUses!: number;

  @Prop({ default: 0 })
  usedCount!: number;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: Date, default: null })
  expiresAt?: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  // The HOD/admin department, so approval screens can scope the list without
  // walking every user's department.
  @Prop({ type: Types.ObjectId, ref: 'Department' })
  creatorDepartment?: Types.ObjectId;
}

export const RegistrationTokenSchema = SchemaFactory.createForClass(RegistrationToken);
RegistrationTokenSchema.index({ token: 1 }, { unique: true });
RegistrationTokenSchema.index({ department: 1, isActive: 1 });
