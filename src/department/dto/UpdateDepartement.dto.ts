import { CreateDepartmentDto } from "./CreateDepartment.dto";
import { PartialType } from '@nestjs/mapped-types';

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {}
