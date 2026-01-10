import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { DepartmentService } from './department.service';
import { CreateDepartmentDto } from './dto/CreateDepartment.dto';
import { JwtAuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { AdminGuard } from 'src/others-stuff/guards/admin.guard';

@Controller('departments')
// @UseGuards(JwtAuthGuard)
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Post()
  // @UseGuards(AdminGuard) // Only admin
  createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.departmentService.createDepartment(dto);
  }

  @Get()
  getAllDepartments() {
    return this.departmentService.getAllDepartments();
  }

  @Get(':id')
  getDepartmentById(@Param('id') id: string) {
    return this.departmentService.getDepartmentById(id);
  }

  @Put(':id')
  @UseGuards(AdminGuard) // Only admin
  updateDepartment(
    @Param('id') id: string,
    @Body() updateData: Partial<CreateDepartmentDto>,
  ) {
    return this.departmentService.updateDepartment(id, updateData);
  }

  @Delete(':id')
  @UseGuards(AdminGuard) // Only admin
  deleteDepartment(@Param('id') id: string) {
    return this.departmentService.deleteDepartment(id);
  }
}
