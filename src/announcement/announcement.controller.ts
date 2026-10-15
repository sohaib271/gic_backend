import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { RolesGuard } from 'src/others-stuff/guards/roles.guard';
import { Roles } from 'src/others-stuff/guards/roles.decorator';
import { AnnouncementService } from './announcement.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

/**
 * Announcements ab sirf create/delete karte hain.
 * Read/Read-status sab GET /notifications?type=announcement se hota hai.
 */
@UseGuards(AuthGuard)
@Controller('announcements')
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  @Post('add-announcement')
  createAnnouncement(
    @Body() dto: CreateAnnouncementDto,
    @Req() req: any,
  ) {
    return this.announcementService.createAnnouncement(dto, req.user.sub, req.user.role);
  }

  @Delete(':id')
  deleteAnnouncement(@Param('id') id: string, @Req() req: any) {
    return this.announcementService.deleteAnnouncement(id, req.user.sub, req.user.role);
  }
}
