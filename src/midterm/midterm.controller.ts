/**
 * 🎮 MIDTERM SCHEDULE CONTROLLER
 * ==============================
 *
 * Endpoints backing the portal's "Midterm Test Schedule" page:
 *
 * GET    /midterm/schedule/:classId   - schedule of a class (HOD/admin/teacher)
 * GET    /midterm/schedule/my         - the logged-in student's own schedule
 * POST   /midterm/schedule/:classId   - save + publish + notify students
 * DELETE /midterm/schedule/:classId   - clear the schedule
 *
 * The logged-in user always comes from the JWT, never from the body.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { RolesGuard } from 'src/others-stuff/guards/roles.guard';
import { Roles } from 'src/others-stuff/guards/roles.decorator';
import { MidtermService } from './midterm.service';
import { SaveMidtermScheduleDto } from './dto/midterm-schedule.dto';

@UseGuards(AuthGuard)
@Controller('midterm')
export class MidtermController {
  constructor(private readonly midtermService: MidtermService) {}

  /**
   * GET /midterm/schedule/my
   * Must stay above ':classId' so "my" is not read as a class id.
   */
  @Get('schedule/my')
  @UseGuards(RolesGuard)
  @Roles('student', 'proff', 'admin', 'hod')
  getMySchedule(@Req() req: any, @Query('classId') classId?: string) {
    return this.midtermService.getMySchedule(req.user.sub, classId);
  }

  /**
   * GET /midterm/schedule/:classId
   * Response:
   * {
   *   classId, className, session, exists,
   *   papers: [{ paper, day, date, start, end }],
   *   summary: { papers, days, from, to },
   *   publishedAt, updatedAt, studentsCount
   * }
   */
  @Get('schedule/:classId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hod', 'proff')
  getSchedule(@Param('classId') classId: string, @Req() req: any) {
    return this.midtermService.getSchedule(classId, req.user.sub);
  }

  /**
   * POST /midterm/schedule/:classId
   * Body: { papers: [{ paper, day, date, start, end }], notify?: boolean }
   *
   * Saving publishes the schedule: every student of the class receives an
   * in-app + push notification with notification_type "20".
   */
  @Post('schedule/:classId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  saveSchedule(
    @Param('classId') classId: string,
    @Body() dto: SaveMidtermScheduleDto,
    @Req() req: any,
  ) {
    return this.midtermService.saveSchedule(classId, dto, req.user.sub);
  }

  /** DELETE /midterm/schedule/:classId */
  @Delete('schedule/:classId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  clearSchedule(@Param('classId') classId: string, @Req() req: any) {
    return this.midtermService.clearSchedule(classId, req.user.sub);
  }
}
