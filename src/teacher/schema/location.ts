import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema({ _id: false })
export class Location {
  @Prop({ required: true, type: Number })
  longitude!: number;

  @Prop({ required: true, type: Number })
  latitude!: number;
}

export const LocationSchema = SchemaFactory.createForClass(Location);
