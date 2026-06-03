import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { Roles } from 'src/others-stuff/guards/roles.decorator';
import { RolesGuard } from 'src/others-stuff/guards/roles.guard';

import { TeacherService } from './teacher.service';

@Controller('teacher')
@UseGuards(AuthGuard)
export class TeacherController {
  constructor(private readonly teacherService: TeacherService) {}

  @Get('my-assigned-students')
  @UseGuards(RolesGuard)
  @Roles('proff')
  getMyAssignedStudents(@Req() req: any) {
    return this.teacherService.getMyAssignedStudents(req?.user?.sub);
  }
}
