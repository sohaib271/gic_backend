import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from 'src/user/schema/user.schema';

// 1. Define the subdocument schema for an individual history log
@Schema({ _id: true, timestamps: true }) // _id: true helps update specific history items later
export class StatusLog {
  @Prop({ required: true})
  status!: string;

  @Prop({ required: true })
  reason!: string;

  @Prop({ required: true, default: null }) // Use function reference instead of executed Date.now()
  start?: Date;

  @Prop({ type: Date, default: null }) // Use null instead of empty string for proper Date typing
  end?: Date | null;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  actionBy!: Types.ObjectId; // Tracks which admin performed the action
}
const StatusLogSchema = SchemaFactory.createForClass(StatusLog);

// 2. Define the main collection schema
export type StruckOffDocument = StruckOff & Document;

@Schema({ timestamps: true }) // Keep timestamps to know when the tracking document was created/updated
export class StruckOff {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, unique: true })
  studentId!: Types.ObjectId;

  // The single source of truth for the student's current active restriction
  @Prop({ type: StatusLogSchema, default: null })
  currentStatus!: StatusLog | null;

  // The historical ledger of all past and present restrictions
  @Prop({ type: [StatusLogSchema], default: [] })
  history!: StatusLog[];
}

export const StruckOffSchema = SchemaFactory.createForClass(StruckOff);
StruckOffSchema.index({ 'currentStatus.status': 1 });
