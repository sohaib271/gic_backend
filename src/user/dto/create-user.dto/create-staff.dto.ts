import { IsOptional, IsString } from 'class-validator';
import { CreateBaseUserDto } from './create-base-user.dto';

export class CreateStaffDto extends CreateBaseUserDto {
  @IsOptional()
  @IsString()
  designation?: string;

  @IsString()
  department: string;
}
