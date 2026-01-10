import { PartialType } from "@nestjs/mapped-types";
import { CreateStaffDto } from "../create-user.dto/create-staff.dto";

export class UpdateStudentsDto extends PartialType(CreateStaffDto) {}
