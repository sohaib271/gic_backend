// leave.dto.ts
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  LeaveDayPartEnum,
  LeaveStatusEnum,
} from '../schema/leave-request.schema';

/**
 * POST /leave — student (or any staff member) applies for leave.
 * The applicant is read from the JWT, never from the body.
 */
export class ApplyLeaveDto {
  @IsMongoId({ message: 'Invalid leave type ID' })
  leaveType!: string;

  @IsDateString({}, { message: 'fromDate must be a valid ISO date string' })
  fromDate!: string;

  @IsDateString({}, { message: 'toDate must be a valid ISO date string' })
  toDate!: string;

  @IsOptional()
  @IsEnum(LeaveDayPartEnum, {
    message: 'dayPart must be "full" or "half"',
  })
  dayPart?: LeaveDayPartEnum;

  // Only "not empty" is enforced — there is no minimum length, so a short
  // reason like "Sick" is accepted.
  @IsNotEmpty({ message: 'Reason is required' })
  @IsString()
  @MaxLength(500, { message: 'Reason must not exceed 500 characters' })
  reason!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-\s()]{6,20}$/, {
    message: 'contactNumber must be a valid phone number',
  })
  contactNumber?: string;
}

/**
 * GET /leave/my_leaves — one endpoint, three behaviours.
 * The backend reads the role off the token and scopes the result:
 *   student          -> only that student's own applications
 *   proff + isHod    -> every application from students of the HOD's department
 *   admin            -> all applications (optionally narrowed by ?department)
 * Extra filters below are only honoured when the role allows them.
 */
export class GetLeavesDto {
  @IsOptional()
  @IsEnum(LeaveStatusEnum, {
    message: `status must be one of: ${Object.values(LeaveStatusEnum).join(', ')}`,
  })
  status?: LeaveStatusEnum;

  @IsOptional()
  @IsMongoId({ message: 'Invalid leave type ID' })
  leaveType?: string;

  /** admin only — narrow the list to one department */
  @IsOptional()
  @IsMongoId({ message: 'Invalid department ID' })
  department?: string;

  /** admin / HOD only — narrow the list to one student */
  @IsOptional()
  @IsMongoId({ message: 'Invalid student ID' })
  studentId?: string;

  /** only applications starting on or after this date (alias: fromDate) */
  @IsOptional()
  @IsDateString({}, { message: 'from must be a valid ISO date string' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'fromDate must be a valid ISO date string' })
  fromDate?: string;

  /** only applications ending on or before this date (alias: toDate) */
  @IsOptional()
  @IsDateString({}, { message: 'to must be a valid ISO date string' })
  to?: string;

  @IsOptional()
  @IsDateString({}, { message: 'toDate must be a valid ISO date string' })
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNotEmpty()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNotEmpty()
  limit?: number;
}

/**
 * PATCH /leave/:id/status — HOD/admin approves or rejects.
 */
export class ReviewLeaveDto {
  @IsEnum([LeaveStatusEnum.APPROVED, LeaveStatusEnum.REJECTED], {
    message: 'status must be "approved" or "rejected"',
  })
  status!: LeaveStatusEnum.APPROVED | LeaveStatusEnum.REJECTED;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Note must not exceed 300 characters' })
  note?: string;
}
