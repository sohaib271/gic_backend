import {
  IsMongoId,
  IsOptional,
  IsString,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { CreateBaseUserDto } from './create-base-user.dto';

export class CreateProfessorDto extends CreateBaseUserDto {
  @IsMongoId()
  department: string;

  @IsOptional()
  @IsArray()
  subjects?: string[];

  @IsOptional()
  @IsString()
  qualification?: string;

  @IsOptional()
  @IsBoolean()
  isPrincipal?: boolean;

  @IsOptional()
  @IsBoolean()
  isHod?: boolean;
}
