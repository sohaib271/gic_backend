import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SettingDocument = Setting & Document;

@Schema({ timestamps: true })
export class Setting {
  @Prop({ required: true, unique: true })
  key!: string;

  @Prop({ type: Object, default: null })
  value?: any;
}

export const SettingSchema = SchemaFactory.createForClass(Setting);