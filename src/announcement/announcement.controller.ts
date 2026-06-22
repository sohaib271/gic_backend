import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { RolesGuard } from 'src/others-stuff/guards/roles.guard';
import { Roles } from 'src/others-stuff/guards/roles.decorator';
import { AnnouncementService } from './announcement.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

@UseGuards(AuthGuard)
@Controller('announcements')
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Get()
  getAnnouncements(
    @Query('teacherId') teacherId?: string,
    @Query('className') className?: string,
    @Query('creatorRole') creatorRole?: string,
    @Req() req?: any,
  ) {
    return this.announcementService.getAnnouncements(
      teacherId,
      className,
      creatorRole,
      req?.user?.sub,
    );
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  @Post('add-announcement')
  createAnnouncement(
    @Body() dto: CreateAnnouncementDto,
    @Req() req: any,
  ) {
    return this.announcementService.createAnnouncement(dto, req.user.sub, req.user.role);
  }

  @Post(':id/read')
  markAsRead(@Param('id') id: string, @Req() req: any) {
    return this.announcementService.markAsRead(id, req.user.sub);
  }

  @Delete(':id')
  deleteAnnouncement(@Param('id') id: string, @Req() req: any) {
    return this.announcementService.deleteAnnouncement(id, req.user.sub, req.user.role);
  }
}