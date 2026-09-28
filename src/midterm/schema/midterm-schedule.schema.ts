/**
 * 📋 MIDTERM SCHEDULE SCHEMA
 * ==========================
 * MongoDB collection: midtermschedules
 *
 * Purpose: store the per-class midterm exam date sheet built by the HOD from
 * Settings > Midterm Tests > Classes > "Midterm Test Schedule".
 *
 * One document per class (classId is unique). `papers` mirrors the rows of the
 * portal's schedule table: subject, weekday, date, start time and end time.
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Class } from 'src/class/schema/class.schema';
import { User } from 'src/user/schema/user.schema';
import { MIDTERM_WEEKDAYS } from 'src/midterm/midterm.constants';

export type MidtermScheduleDocument = MidtermSchedule & Document;

/** A single exam sitting — one row in the portal's "Papers & Timings" table. */
@Schema({ _id: false })
export class MidtermPaper {
  /** Subject / paper name, e.g. "English". */
  @Prop({ required: true, trim: true })
  paper!: string;

  /** Weekday label, e.g. "Monday". */
  @Prop({ required: true, enum: MIDTERM_WEEKDAYS })
  day!: string;

  /** Calendar date as YYYY-MM-DD (kept as string so it round-trips the <input type="date">). */
  @Prop({ required: true })
  date!: string;

  /** Start time as HH:mm (24h). */
  @Prop({ required: true })
  start!: string;

  /** End time as HH:mm (24h). */
  @Prop({ required: true })
  end!: string;
}

export const MidtermPaperSchema = SchemaFactory.createForClass(MidtermPaper);

@Schema({ timestamps: true })
export class MidtermSchedule {
  /**
   * Class this schedule belongs to. `unique` is what makes the upsert in the
   * service safe: one schedule per class, no duplicates on concurrent saves.
   */
  @Prop({
    type: Types.ObjectId,
    ref: Class.name,
    required: true,
    unique: true,
  })
  classId!: Types.ObjectId;

  /** All papers of the schedule, in the order the HOD entered them. */
  @Prop({ type: [MidtermPaperSchema], default: [] })
  papers!: MidtermPaper[];

  /** HOD/admin who created the schedule. */
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  createdBy!: Types.ObjectId;

  /** HOD/admin who last saved the schedule. */
  @Prop({ type: Types.ObjectId, ref: User.name })
  updatedBy?: Types.ObjectId;

  /**
   * When the schedule was last published. Every save re-stamps this, which is
   * the moment the students get notified.
   */
  @Prop({ type: Date, default: null })
  publishedAt?: Date;
}

export const MidtermScheduleSchema =
  SchemaFactory.createForClass(MidtermSchedule);
