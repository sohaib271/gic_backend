import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { User } from 'src/user/schema/user.schema';

export type MessageDocument = Message & Document;

/** Snapshot of the quoted message stored on a reply at send time (WhatsApp-style). */
export interface MessageReplyTo {
  messageId: Types.ObjectId | null;
  text: string;
  senderId: Types.ObjectId | null;
  senderName: string;
}

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Conversation', required: true })
  conversationId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: User.name, required: true })
  senderId!: Types.ObjectId;

  @Prop({ required: true })
  text!: string;

  @Prop({
    type: {
      messageId: { type: SchemaTypes.ObjectId, default: null },
      text: { type: String, default: '' },
      senderId: { type: SchemaTypes.ObjectId, default: null },
      senderName: { type: String, default: '' },
    },
    _id: false,
    default: null,
  })
  replyTo?: MessageReplyTo | null;

  @Prop({ default: false })
  deleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ type: [{ type: SchemaTypes.ObjectId, ref: User.name }], default: [] })
  readBy!: Types.ObjectId[];

  @Prop({
    type: [
      {
        fileId: { type: SchemaTypes.ObjectId, required: true },
        name: { type: String, default: 'attachment' },
        mime: { type: String, default: 'application/octet-stream' },
        size: { type: Number, default: 0 },
      },
    ],
    default: [],
    _id: false,
  })
  attachments?: {
    fileId: Types.ObjectId;
    name: string;
    mime: string;
    size: number;
  }[];

  @Prop({ type: Date, default: Date.now })
  createdAt!: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt!: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ conversationId: 1, createdAt: -1 });