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

  @IsNotEmpty({ message: 'Session is required' })
  @IsString()
  session!: string;

  @IsIn(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'], {
    message: 'Class/Semester must be between I and VIII',
  })
  class!: string;

  @IsIn(['intermediate', 'bs', 'adp'])
  category!: string; // e.g intermediate,bs,adp

  @IsOptional()
  @IsString()
  section?: string;

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
