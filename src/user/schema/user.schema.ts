// src/users/schemas/user.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRoleEnum } from '../enum/UserRole.enum';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  /* =======================
     COMMON FIELDS (ALL)
  ======================== */

  @Prop({ required: true, unique: true })
  specialId: string;

  @Prop({required:true,unique:true})
  email:string;

  @Prop({default:true})
  isActive?:boolean;

  @Prop({default:''})
  image?:string

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  fatherName: string;

  @Prop({ required: true, unique: true })
  cnic: string;

  @Prop({ required: true })
  phone: string;

  @Prop()
  address?: string;

  @Prop({
    required: true,
    enum: UserRoleEnum,
  })
  role: string;

  @Prop()
  password: string;

  @Prop()
  verifyToken?: string;

  @Prop({ default: false })
  isQrScanned: boolean;

  /* =======================
     STUDENT FIELDS
  ======================== */

  @Prop({ type: Types.ObjectId, ref: 'Department' })
  department: Types.ObjectId;

  @Prop()
  session?: string;

  @Prop([String])
  subjects?: string[];

  @Prop()
  matricMarks?: number;

  @Prop()
  whatsappNumber?: string;

  /* =======================
     PROFESSOR FIELDS
     (ONLY FOR PROFESSOR)
  ======================== */

  @Prop({ default: false })
  isHod?: boolean;

  @Prop({ default: false })
  isPrincipal?: boolean;

  @Prop()
  qualification?: string;

  @Prop()
  experience?: number;

  /* =======================
     STAFF FIELDS
  ======================== */

  @Prop()
  designation?: string;

}

export const UserSchema = SchemaFactory.createForClass(User);
