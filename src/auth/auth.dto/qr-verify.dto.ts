import { IsNotEmpty, IsString } from 'class-validator';

export class QrVerifyDto {
  @IsNotEmpty()
  @IsString()
  token: string;
}
