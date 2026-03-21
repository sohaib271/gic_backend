
import { IsMongoId, IsOptional, IsString,IsArray } from 'class-validator';

export class AssignedTeacherDto {
  @IsMongoId({ message: 'Invalid teacher ID' })
  teacherId: string;

  @IsOptional()
  @IsString()
  subject?: string;

   @IsArray()
    @IsString({ each: true })
    @IsOptional()
    days?: string[];

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;
}
