import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ActivityDocument = Activity & Document;

@Schema({ timestamps: true })
export class Activity {
  @Prop()
  name?: string;

  @Prop()
  dep?: string;

  @Prop()
  role?: string;

  @Prop()
  image?: string;

  @Prop({ required: true })
  title!: string;

  @Prop()
  description?: string;

  @Prop()
  date?: Date;

  @Prop({ type: [String], default: [] })
  images!: string[];
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);
