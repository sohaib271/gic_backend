import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { CreateBaseUserDto } from './create-base-user.dto';

export class CreateStaffDto extends CreateBaseUserDto {
  @IsOptional()
  @IsString()
  designation?: string;

  @IsString()
  department: string;

  @IsOptional()
  @IsBoolean()
  is_CTI?: boolean;

  @IsOptional()
  @IsBoolean()
  is_permanent?: boolean;
}
