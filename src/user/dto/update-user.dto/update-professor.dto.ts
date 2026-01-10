import { PartialType } from "@nestjs/mapped-types";
import { CreateProfessorDto } from "../create-user.dto/create-professor.dto";

export class UpdateStudentsDto extends PartialType(CreateProfessorDto) {}
