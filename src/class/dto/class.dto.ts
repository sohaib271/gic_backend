
import {
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { AssignedTeacherDto } from './assignes.dto';
import {Type} from "class-transformer"

export class CreateClassDto {

  @IsString()
  @IsNotEmpty()
  className:string

  @IsMongoId()
  @IsNotEmpty()
  createdBy:string;

  @IsMongoId()
  @IsNotEmpty()
  departmentId:string;

  @IsString()
  @IsNotEmpty()
  departmentName:string;

  @IsArray()
  @IsMongoId({ each: true })
  classStudents: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignedTeacherDto)
  assignes: AssignedTeacherDto[];

 //subjects will be extracted from assignes

  @IsString()
  @IsNotEmpty()
  session:string;

  @IsString()
  @IsOptional()
  semester?:string;

  @IsString()
  @IsOptional()
  inter?:string;

}
