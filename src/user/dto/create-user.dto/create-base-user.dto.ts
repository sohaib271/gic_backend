import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { UserRoleEnum } from '../../enum/UserRole.enum';

export class CreateBaseUserDto {
  @IsNotEmpty()
  @IsString()
  specialId: string;

  @IsNotEmpty()
  @IsString()
  password:string

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  fatherName: string;

  @IsNotEmpty()
  @IsString()
  cnic: string;

  @IsNotEmpty()
  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsEnum(UserRoleEnum)
  role: UserRoleEnum;
}
