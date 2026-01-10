// src/departments/dto/department.dto.ts
import { IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDepartmentDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsMongoId()
  code?: string; 
}
