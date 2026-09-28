import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * PATCH /leave-types/:id
 * `name` renames the type, `isActive` retires/restores it. Both optional —
 * send only what should change.
 */
export class UpdateLeaveTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Leave type name is required' })
  @MaxLength(50, { message: 'Leave type name must not exceed 50 characters' })
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
