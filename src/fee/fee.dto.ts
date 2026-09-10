import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDateString, IsEnum, IsArray, IsObject, IsMongoId, IsIn, ArrayNotEmpty, Min } from 'class-validator';
import { FeeStatusEnum } from './fee.schema';
import { Type } from 'class-transformer';

export class CreateFeeDto {
  @IsMongoId()
  @IsNotEmpty()
  studentId: string;

  @IsOptional()
  @IsMongoId()
  classId?: string;

  @IsOptional()
  @IsMongoId()
  departmentId?: string;

  @IsOptional()
  @IsString()
  className?: string;

  @IsString()
  @IsNotEmpty()
  month: string;

  @IsNumber()
  @Type(() => Number)
  year: number;

  @IsNumber()
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsEnum(FeeStatusEnum)
  status?: FeeStatusEnum;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsDateString()
  paidDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  semester?: string;

  @IsOptional()
  @IsString()
  class?: string;

  @IsOptional()
  @IsArray()
  customFields?: Record<string, any>[];
}

export class UpdateFeeDto extends CreateFeeDto {}

export class GetStudentFeeDto {
  @IsOptional()
  @IsString()
  year?: string;
}

export class GetDepartmentStudentsFeeDto {
  @IsMongoId()
  @IsNotEmpty()
  departmentId: string;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * Bulk fee generation (admin panel)
 * POST /fee/generate
 */
export class GenerateFeeDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  studentIds: string[];

  @IsOptional()
  @IsMongoId()
  classId?: string;

  @IsOptional()
  @IsString()
  className?: string;

  @IsString()
  @IsNotEmpty()
  month: string;

  @IsNumber()
  @Type(() => Number)
  year: number;

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  amount: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  semester?: string;

  @IsOptional()
  @IsString()
  class?: string;

  @IsOptional()
  @IsArray()
  customFields?: Record<string, any>[];
}

/**
 * Filtered record list (admin panel)
 * GET /fee/records
 */
export class GetFeeRecordsDto {
  @IsOptional()
  @IsMongoId()
  studentId?: string;

  @IsOptional()
  @IsMongoId()
  classId?: string;

  @IsOptional()
  @IsString()
  month?: string;

  @IsOptional()
  @Type(() => Number)
  year?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  semester?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

/**
 * Update fee status (admin panel)
 * PATCH /fee/records/:id/status
 */
export class UpdateFeeStatusDto {
  @IsIn(['pending', 'paid', 'waived'])
  status: 'pending' | 'paid' | 'waived';

  @IsOptional()
  @IsDateString()
  paidDate?: string;
}