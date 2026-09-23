import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { User } from 'src/user/schema/user.schema';

export type ConversationDocument = Conversation & Document;

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ enum: ['direct'], default: 'direct' })
  type!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: User.name, required: true })
  creatorId!: Types.ObjectId;

  @Prop({ type: [{ type: SchemaTypes.ObjectId, ref: User.name }], default: [] })
  participants!: Types.ObjectId[];

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Message', default: null })
  lastMessage?: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  lastMessageText?: string | null;

  @Prop({ type: Date, default: null })
  lastMessageAt?: Date | null;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ participants: 1 });