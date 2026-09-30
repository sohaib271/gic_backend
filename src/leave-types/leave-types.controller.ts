import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { LeaveTypesService } from './leave-types.service';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';

@UseGuards(AuthGuard)
@Controller('leave-types')
export class LeaveTypesController {
  constructor(private readonly leaveTypesService: LeaveTypesService) {}

  @Post()
  addLeaveType(@Body('name') name: string, @Req() req: any) {
    return this.leaveTypesService.createLeaveType(name, req.user);
  }

  /**
   * GET /leave-types?all=true
   * Students get the active types; an admin can also list retired ones.
   */
  @Get()
  getLeaveTypes(@Query('all') all?: string, @Req() req?: any) {
    const includeInactive = all === 'true' && req?.user?.role === 'admin';
    return this.leaveTypesService.getAllLeaveTypes(includeInactive);
  }

  @Get(':id')
  getLeaveType(@Param('id') id: string) {
    return this.leaveTypesService.getLeaveType(id);
  }

  // Role is resolved in the service (admin or HOD), so the blanket admin-only
  // guard that used to sit here would have blocked HODs from editing.
  @Patch(':id')
  updateLeaveType(
    @Param('id') id: string,
    @Body() dto: UpdateLeaveTypeDto,
    @Req() req: any,
  ) {
    return this.leaveTypesService.updateLeaveType(id, dto, req.user);
  }

  @Delete(':id')
  deleteLeaveType(@Param('id') id: string, @Req() req: any) {
    return this.leaveTypesService.deleteLeaveType(id, req.user);
  }
}
