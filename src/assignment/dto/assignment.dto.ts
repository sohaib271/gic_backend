/**
 * 📨 ASSIGNMENT DTOs
 * ==================
 * DTOs carry file IDs only. The server resolves each id against GridFS and
 * copies the stored name/mime/size into the document, so a client can never
 * spoof a display name or a size.
 */

import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ASSIGNMENT_STATUSES } from '../assignment.constants';

export class CreateAssignmentDto {
  @IsMongoId()
  classId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  subjectId?: number;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString({}, { message: 'Due date must be a valid ISO date' })
  dueAt!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxMarks?: number;

  @IsOptional()
  @IsBoolean()
  allowLate?: boolean;

  @IsOptional()
  @IsIn(ASSIGNMENT_STATUSES as unknown as string[])
  status?: 'published' | 'closed';

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  fileIds?: string[];

  /** Publish notifications on create / update. Defaults to true on create. */
  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}

export class UpdateAssignmentDto extends PartialType(CreateAssignmentDto) {}

export class SubmitAssignmentDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  fileIds?: string[];
}

export class GradeSubmissionDto {
  @IsNumber({}, { message: 'Marks must be a number' })
  @Min(0)
  @Type(() => Number)
  marks!: number;

  @IsOptional()
  @IsString()
  feedback?: string;
}
