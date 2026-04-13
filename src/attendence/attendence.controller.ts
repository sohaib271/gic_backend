// attendence.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AttendenceService } from './attendence.service';
import { BulkAttendenceDto, CreateAttendenceDto, UpdateAttendenceDto } from './dto/attendence.dto';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { RolesGuard } from 'src/others-stuff/guards/roles.guard';
import { Roles } from 'src/others-stuff/guards/roles.decorator';

@UseGuards(AuthGuard)
@Controller('attendance')
export class AttendenceController {
  constructor(private readonly attendenceService: AttendenceService) {}

  // ✅ Mark single student attendance
  @Post('mark')
  @UseGuards(RolesGuard)
  @Roles("admin","proff")
  markAttendence(@Body() dto: CreateAttendenceDto) {
    return this.attendenceService.markAttendence(dto);
  }

  @Patch("update/:attendanceId")
@UseGuards(RolesGuard)
@Roles("admin","proff")
updateAttendance(@Param('attendanceId') attendanceId:string,@Body() dto: UpdateAttendenceDto) {
  return this.attendenceService.updateAttendance(attendanceId,dto);
}

  // ✅ Mark entire class attendance in one request (recommended)
  @Post('mark-bulk')
  @UseGuards(RolesGuard)
  @Roles('admin', 'proff')
  markBulkAttendence(@Body() dto: BulkAttendenceDto) {
    return this.attendenceService.markBulkAttendence(dto);
  }

  @Get('class/:classId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'proff')
  getClassAttendence(
    @Param('classId') classId: string,
    @Query('date') date: string,
  ) {
    if (!date) return { message: 'Please provide a date query param' };
    return this.attendenceService.getClassAttendenceByDate(classId, date);
  }

  @Get('student/:classId/:studentId')
   @UseGuards(RolesGuard)
  @Roles("admin","proff","student")
  getStudentAttendence(
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.attendenceService.getStudentAttendence(classId, studentId);
  }
}
