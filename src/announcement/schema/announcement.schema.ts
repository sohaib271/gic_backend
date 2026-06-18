import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from 'src/user/schema/user.schema';

export type AnnouncementDocument = Announcement & Document;

export enum CreatorRole {
  ADMIN = 'admin',
  HOD = 'hod',
}

@Schema({ timestamps: true })
export class Announcement {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  teacherId!: Types.ObjectId;

  @Prop({ type: [String], required: true })
  classNames!: string[];

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true, enum: CreatorRole })
  creatorRole!: CreatorRole;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: User.name }], default: [] })
  readBy!: Types.ObjectId[];
}

export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);
AnnouncementSchema.index({ teacherId: 1 });
AnnouncementSchema.index({ classNames: 1 });
AnnouncementSchema.index({ creatorRole: 1 });
AnnouncementSchema.index({ createdAt: -1 });
AnnouncementSchema.index({ readBy: 1 });