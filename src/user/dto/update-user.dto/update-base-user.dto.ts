import { PartialType } from "@nestjs/mapped-types";
import { CreateBaseUserDto } from "../create-user.dto/create-base-user.dto";

export class UpdateStudentsDto extends PartialType(CreateBaseUserDto) {}
