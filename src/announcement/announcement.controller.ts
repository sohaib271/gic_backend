import {
  Controller,
  Get,
  Post,
  Body,
  Query,
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
  ) {
    return this.announcementService.getAnnouncements(
      teacherId,
      className,
      creatorRole,
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
}