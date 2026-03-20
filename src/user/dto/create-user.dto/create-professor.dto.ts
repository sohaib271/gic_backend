import {
  IsMongoId,
  IsOptional,
  IsNotEmpty,
  IsString,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { CreateBaseUserDto } from './create-base-user.dto';

export class CreateProfessorDto extends CreateBaseUserDto {
  @IsNotEmpty({ message: 'Department is required' })
  @IsMongoId()
  department: string;

  @IsArray()
  @IsNotEmpty({ each: true, message: 'Subjects must not be empty' })
  subjects: string[];

 @IsNotEmpty({ message: 'Qualification is required' })
  @IsString()
  qualification: string;

  @IsOptional()
  @IsBoolean()
  isPrincipal?: boolean;

  @IsOptional()
  @IsBoolean()
  isHod?: boolean;
}
