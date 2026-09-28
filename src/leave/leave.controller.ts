/**
 * LEAVE CONTROLLER
 * ================
 * Every route is behind AuthGuard, so `req.user` is a verified JWT payload.
 * The applicant and the reviewer are both derived from the token — the client
 * never gets to say who they are.
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { LeaveService } from './leave.service';
import { ApplyLeaveDto, GetLeavesDto, ReviewLeaveDto } from './dto/leave.dto';

@UseGuards(AuthGuard)
@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  /**
   * POST /leave
   * Student applies -> department HOD is notified.
   */
  @Post()
  apply(@Body() dto: ApplyLeaveDto, @Req() req: any) {
    return this.leaveService.apply(dto, req);
  }

  /**
   * GET /leave/my_leaves
   * One call for everyone. The backend reads the role from the token and
   * returns the list that role is allowed to see, plus the role/scope flags
   * the app needs to render the right screen.
   */
  @Get('my_leaves')
  getMyLeaves(@Query() query: GetLeavesDto, @Req() req: any) {
    return this.leaveService.getMyLeaves(query, req);
  }

  /**
   * GET /leave/:id
   * Applicant, their HOD or admin only.
   */
  @Get(':id')
  getLeave(@Param('id') id: string, @Req() req: any) {
    return this.leaveService.getById(id, req);
  }

  /**
   * PATCH /leave/:id/status
   * HOD of the applicant's department or admin approves/rejects.
   * The student receives a notification with the outcome.
   */
  @Patch(':id/status')
  review(@Param('id') id: string, @Body() dto: ReviewLeaveDto, @Req() req: any) {
    return this.leaveService.review(id, dto, req);
  }

  /**
   * PATCH /leave/:id/cancel
   * Applicant withdraws their own pending request.
   */
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @Req() req: any) {
    return this.leaveService.cancel(id, req);
  }
}
