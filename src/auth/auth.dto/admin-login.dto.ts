import { IsNotEmpty, IsString } from 'class-validator';

export class AdminLoginDto {
  @IsNotEmpty()
  @IsString()
  specialId: string;

  @IsNotEmpty()
  @IsString()
  password: string;
}
