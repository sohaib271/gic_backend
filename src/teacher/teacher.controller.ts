import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { Roles } from 'src/others-stuff/guards/roles.decorator';
import { RolesGuard } from 'src/others-stuff/guards/roles.guard';

import { TeacherService } from './teacher.service';
import { TeacherAttendanceDto } from './dto/teacherAttendanceDto';

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

  @Post('mark-attendance')
  @UseGuards(RolesGuard)
  @Roles('proff')
  markAttendance(@Body() dto:TeacherAttendanceDto,@Req() req: any) {
    return this.teacherService.markTeacherAttendance(dto,req?.user?.sub);
  }

  @Get('attendance-records')
  @UseGuards(RolesGuard)
  @Roles('admin')
  getRecords() {
    return this.teacherService.getRecord();
  }
  // teacher.controller.ts
@Get('today-status')
@UseGuards(RolesGuard)
@Roles('proff')
getTodayStatus(@Req() req: any) {
  return this.teacherService.getTodayAttendanceStatus(req?.user?.sub);
}

@Get('qr')
@UseGuards(RolesGuard)
@Roles('admin', 'proff')
generateQR() {
  return this.teacherService.generateSharedQR();
}

  // teacher.controller.ts — add
// @Get('qr/:teacherId')
// @UseGuards(RolesGuard)
// @Roles('admin', 'proff')
// generateQR(@Param('teacherId') teacherId: string) {
//   return this.teacherService.generateTeacherQR(teacherId);
// }

  @Get('attendance')
  @UseGuards(RolesGuard)
  @Roles('proff')
  getMyAttendance(@Req() req: any) {
    return this.teacherService.getMyAttendance(req?.user?.sub);
  }

  @Get('attendance/:teacherId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'proff')
  getTeacherAttendance(@Param('teacherId') teacherId: string) {
    return this.teacherService.getTeacherAttendance(teacherId);
  }
}
