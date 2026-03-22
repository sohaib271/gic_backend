// assigned-teacher.dto.ts
import { IsString, IsNotEmpty, IsArray, ValidateNested, IsOptional, IsMongoId } from 'class-validator';
import { Type } from 'class-transformer';

export class ScheduleDto {
  @IsString()
  @IsNotEmpty({ message: 'Day is required' })
  day: string;

  @IsString()
  @IsNotEmpty({ message: 'Start time is required' })
  startTime: string;

  @IsString()
  @IsNotEmpty({ message: 'End time is required' })
  endTime: string;
}

export class AssignedTeacherDto {
  @IsMongoId({ message: 'Invalid teacher ID' })
  teacherId: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleDto)
  schedule: ScheduleDto[];
}