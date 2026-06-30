import {
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
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

  @IsOptional()
  @IsIn(['intermediate', 'bs', 'adp'])
  category?: string;

  @IsOptional()
  @IsIn(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'])
  class?: string;

  @IsNotEmpty({message:"Matric marks are required"})
  @Type(() => Number)
  @IsNumber()
  matricMarks!: number;

  @ValidateIf((student) => student.category !== 'intermediate')
  @IsNotEmpty({message:"Inter marks are required"})
  @Type(() => Number)
  @IsNumber()
  interMarks?: number;

  @IsOptional()
  @IsString()
  doj?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;
}
