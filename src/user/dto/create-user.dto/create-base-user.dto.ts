import {
  IsString, IsEmail, IsNotEmpty, IsOptional,
   Length, Matches,IsEnum
} from 'class-validator';

import { UserRoleEnum } from '../../enum/UserRole.enum';

export class CreateBaseUserDto {
  @IsNotEmpty()
  @IsString()
  @IsEmail({}, { message: 'Invalid email format' })
  email:string;

  @IsString()
  @IsOptional()
  gender?:string

  @IsOptional()
  @IsString()
  image?:string

  @IsNotEmpty()
  @IsString()
  password:string

  @IsNotEmpty()
  @IsString()
  @Length(1, 30, { message: 'First name must not exceed 30 characters' })
  name: string;

  @IsNotEmpty()
  @IsString()
   @Length(1, 30, { message: 'Last name must not exceed 30 characters' })
  lastName: string;

  @IsNotEmpty()
  @IsString()
  @Length(13, 13, { message: 'CNIC must be exactly 13 digits' })
  @Matches(/^\d{13}$/, { message: 'CNIC must contain only digits' })
  cnic: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^(92\d{10}|0\d{10})$/, {
    message: 'Phone must be 12 digits starting with 92, or 11 digits starting with 0',
  })
  phone: string;

  @IsNotEmpty()
  @IsString()
  address: string;

  @IsNotEmpty()
  @IsString()
  city:string

  @IsEnum(UserRoleEnum)
  role: UserRoleEnum;
}
