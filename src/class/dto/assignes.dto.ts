// assigned-teacher.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsOptional,
  IsMongoId,
  IsInt,
  Min,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ScheduleDto {
  @IsString()
  @IsNotEmpty({ message: 'Day is required' })
  day!: string;

  @IsString()
  @Matches(HHMM, { message: 'Start time must be in HH:mm format (24-hour)' })
  startTime!: string;

  @IsString()
  @Matches(HHMM, { message: 'End time must be in HH:mm format (24-hour)' })
  endTime!: string;

  // Optional on the wire: the admin portal still sends only
  // {day, startTime, endTime}. When omitted the server numbers the period per
  // day by start time, which is what a timetable means by "period 1".
  @IsOptional()
  @IsInt({ message: 'lectureNumber must be an integer' })
  @Min(1, { message: 'lectureNumber starts from 1' })
  lectureNumber?: number;

  // Optional for the same reason — resolved from `subject` (or the
  // assignment-level subject) when the client does not know the numeric id.
  @IsOptional()
  @IsInt({ message: 'subjectId must be an integer' })
  @Min(1, { message: 'subjectId starts from 1' })
  subjectId?: number;

  // Subject name, used when the client has no numeric id. Kept as a snapshot
  // on the stored entry so pre-Subject schedules stay readable.
  @IsOptional()
  @IsString()
  subject?: string;
}

export class AssignedTeacherDto {
  @IsMongoId({ message: 'Invalid teacher ID' })
  teacherId!: string;

  @IsOptional()
  @IsInt({ message: 'subjectId must be an integer' })
  @Min(1, { message: 'subjectId starts from 1' })
  subjectId?: number;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleDto)
  schedule?: ScheduleDto[];
}

export class UpdateScheduleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleDto)
  schedule: ScheduleDto[];
}
