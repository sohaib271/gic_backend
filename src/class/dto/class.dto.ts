// create-class.dto.ts
import {
  IsString, IsNotEmpty, IsMongoId, IsArray,
  IsOptional, IsEnum, ValidateNested, IsIn
} from 'class-validator';
import { Type } from 'class-transformer';
import { AssignedTeacherDto } from './assignes.dto';

export class CreateClassDto {
  @IsNotEmpty({ message: 'Class name is required' })
  @IsString()
  className!: string;

  @IsMongoId({ message: 'Invalid department' })
  departmentId!: string;

  @IsMongoId({ message: 'Invalid creator ID' })
  createdBy!: string;

  @IsNotEmpty({ message: 'Session is required' })
  @IsString()
  session!: string;

  @IsIn(['I', 'II'], { message: 'Class must be I or II for intermediate' })
  class!: string;

  // ✅ Always "intermediate" — set in service, not sent from frontend
  category?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignedTeacherDto)
  @IsOptional()
  assignes?: AssignedTeacherDto[];

  @IsArray()
  @IsMongoId({ each: true, message: 'Invalid student ID' })
  @IsOptional()
  classStudents?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  subjects?: string[];
}