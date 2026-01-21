import { Type } from "class-transformer";
import { IsArray, ValidateNested } from "class-validator";
import { AssignedTeacherDto } from "./assignes.dto";

export class AssignTeachersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignedTeacherDto)
  assignes: AssignedTeacherDto[];
}
