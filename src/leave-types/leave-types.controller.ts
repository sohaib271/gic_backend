import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { LeaveTypesService } from './leave-types.service';

@UseGuards(AuthGuard)
@Controller('leave-types')
export class LeaveTypesController {
  constructor(private readonly leaveTypesService: LeaveTypesService) {}

  @Post()
  addLeaveType(@Body('name') name: string, @Req() req: any) {
    return this.leaveTypesService.createLeaveType(name, req.user.role);
  }

  @Get()
  getLeaveTypes() {
    return this.leaveTypesService.getAllLeaveTypes();
  }

  @Delete(':id')
  deleteLeaveType(@Param('id') id: string, @Req() req: any) {
    return this.leaveTypesService.deleteLeaveType(id, req.user.role);
  }
}