import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { User } from 'src/user/schema/user.schema';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Conversation', required: true })
  conversationId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: User.name, required: true })
  senderId!: Types.ObjectId;

  @Prop({ required: true })
  text!: string;

  @Prop({ type: [{ type: SchemaTypes.ObjectId, ref: User.name }], default: [] })
  readBy!: Types.ObjectId[];

  @Prop({ type: Date, default: Date.now })
  createdAt?: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt?: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ conversationId: 1, createdAt: -1 });