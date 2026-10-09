import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DepartmentService } from './department.service';
import { CreateDepartmentDto } from './dto/CreateDepartment.dto';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { AdminGuard } from 'src/others-stuff/guards/admin.guard';

@Controller('departments')
@UseGuards(AuthGuard)
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Post("create")
  @UseGuards(AdminGuard) // Only admin
  createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.departmentService.createDepartment(dto);
  }

  @Get()
  getAllDepartments() {
    return this.departmentService.getAllDepartments();
  }

  /**
   * HOD department dashboard.
   * GET /departments/dashboard?from=&to=&year=
   * Department is resolved from the logged-in HOD/admin token — the client
   * never sends a department id.
   * NOTE: must be declared before @Get(':id') so it is not swallowed by it.
   */
  @Get('dashboard')
  getHodDashboard(@Query() query: any, @Req() req: any) {
    return this.departmentService.getHodDashboard(query, req);
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
