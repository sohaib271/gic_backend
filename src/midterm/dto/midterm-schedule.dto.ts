/**
 * 📝 MIDTERM SCHEDULE DTOs
 * =======================
 * One row of the portal's "Papers & Timings" table = one MidtermPaperDto.
 */

import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MIDTERM_MAX_PAPERS, MIDTERM_WEEKDAYS } from '../midterm.constants';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class MidtermPaperDto {
  /** Paper / Subject — e.g. "English". */
  @IsString({ message: 'Paper must be a string' })
  @IsNotEmpty({ message: 'Paper is required' })
  @MaxLength(120, { message: 'Paper name is too long' })
  paper!: string;

  /** Weekday the paper falls on. */
  @IsString({ message: 'Day must be a string' })
  @IsIn(MIDTERM_WEEKDAYS as unknown as string[], {
    message: `Day must be one of: ${MIDTERM_WEEKDAYS.join(', ')}`,
  })
  day!: string;

  /** Exam date — YYYY-MM-DD. */
  @IsString({ message: 'Date must be a string' })
  @Matches(DATE_REGEX, { message: 'Date must be a valid YYYY-MM-DD date' })
  date!: string;

  /** Start time — HH:mm. */
  @IsString({ message: 'Start must be a string' })
  @Matches(TIME_REGEX, { message: 'Start time must be in HH:mm format' })
  start!: string;

  /** End time — HH:mm. */
  @IsString({ message: 'End must be a string' })
  @Matches(TIME_REGEX, { message: 'End time must be in HH:mm format' })
  end!: string;
}

export class SaveMidtermScheduleDto {
  /** Every paper of the schedule; saving replaces the previous list. */
  @IsArray({ message: 'Papers must be an array' })
  @ArrayMinSize(1, { message: 'Add at least one paper' })
  @ArrayMaxSize(MIDTERM_MAX_PAPERS, {
    message: `A schedule cannot have more than ${MIDTERM_MAX_PAPERS} papers`,
  })
  @ValidateNested({ each: true })
  @Type(() => MidtermPaperDto)
  papers!: MidtermPaperDto[];

  /**
   * Set false to save a draft without notifying students.
   * Defaults to true — saving is what publishes the schedule.
   */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  notify?: boolean = true;
}
