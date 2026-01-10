import {
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
} from 'class-validator';
import { CreateBaseUserDto } from './create-base-user.dto';

export class CreateStudentDto extends CreateBaseUserDto {
  @IsMongoId()
  department: string;

  @IsNotEmpty()
  @IsString()
  session: string;

  @IsArray()
  @IsOptional()
  subjects?: string[];

  @IsNumber()
  matricMarks: number;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;
}
