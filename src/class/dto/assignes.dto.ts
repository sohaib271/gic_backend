
import { IsMongoId, IsNotEmpty, IsString } from 'class-validator';

export class AssignedTeacherDto {
  @IsMongoId()
  teacherId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  subject: string;
}
