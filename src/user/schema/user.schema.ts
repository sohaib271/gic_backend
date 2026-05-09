// src/users/schemas/user.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRoleEnum } from '../enum/UserRole.enum';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  specialId!: string;

  @Prop({type:String,default:null})
  otp?:string | null;

  @Prop({type:Number,default:null})
   otpExpiry?:number | null;

  @Prop({required:true,unique:true})
  email!:string;

  @Prop({default:null})
  city?:string;

  @Prop({default:true})
  isActive?:boolean;

  @Prop({default:'M',enum:['M','F']})
  gender?:string

  @Prop({default:''})
  image?:string

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  lastName!: string;

  @Prop({ required: true, unique: true })
  cnic!: string;

  @Prop({ required: true,unique:true })
  phone!: string;

  @Prop()
  address?: string;

  @Prop({
    required: true,
    enum: UserRoleEnum,
  })
  role!: string;

  @Prop()
  password!: string;

  @Prop()
  verifyToken?: string;

  @Prop({ default: false })
  isQrScanned?: boolean;

  /* =======================
     STUDENT FIELDS
  ======================== */

  @Prop({ type: Types.ObjectId, ref: 'Department' })
  department?: Types.ObjectId;

  @Prop()
  session?: string;

  @Prop()
  rollNo!:number;

  @Prop({enum:["intermediate","bs","adp"],default:null})
  category?:string;

  @Prop([String])
  subjects?: string[];

  @Prop()
  matricMarks?: number;

  @Prop({default:null,enum:["I","II","III","IV","V","VI","VII","VIII"]})
  class?:string

  @Prop()
  whatsappNumber?: string;

  /* =======================
     PROFESSOR FIELDS
     (ONLY FOR PROFESSOR)
  ======================== */

  @Prop({ default: false })
  isHod?: boolean;

  @Prop({default:null})
  doj?:string

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
UserSchema.index({ role: 1 });
UserSchema.index({ department: 1, isHod: 1, role: 1 });
