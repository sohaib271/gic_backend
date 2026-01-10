import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class SetPasswordDto {
  @IsNotEmpty()
  @IsString()
  token: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
