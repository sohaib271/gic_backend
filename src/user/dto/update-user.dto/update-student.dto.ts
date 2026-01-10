import { PartialType } from "@nestjs/mapped-types";
import { CreateStudentDto } from "../create-user.dto/create-student.dto";

export class UpdateStudentsDto extends PartialType(CreateStudentDto) {}
