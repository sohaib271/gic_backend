import {
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
} from 'class-validator';
import { CreateBaseUserDto } from './create-base-user.dto';

export class CreateStudentDto extends CreateBaseUserDto {
  @IsNotEmpty({message:"Department is required"})
  @IsMongoId()
  department!: string;

  @IsNotEmpty({message:"Session is required"})
  @IsString()
  session!: string;

  @IsArray()
  @IsOptional()
  subjects?: string[];

  @IsNotEmpty({message:"Roll No is required"})
  @IsNumber()
  rollNo!: number;

  @IsOptional()
  @IsString()
  shift?: string;

  @IsString()
  @IsNotEmpty({message:"Matric marks are required"})
  matricMarks!: number;

  @IsString()
  @IsNotEmpty({message:"Inter marks are required"})
  interMarks!: number;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;
}
