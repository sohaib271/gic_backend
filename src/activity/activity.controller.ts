import { Controller, Get, Post, Body, Param, Res, Query, Req, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ActivityService } from './activity.service';
import { ActivityImageService } from './activity-image.service';
import { AuthGuard } from '../others-stuff/guards/jwt-auth.guard';

@Controller('activity')
export class ActivityController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly imageService: ActivityImageService,
  ) {}

  @Post('post_activity')
  async postActivity(@Body() body: any) {
    return this.activityService.create(body);
  }

  @Get('get_posts')
  @UseGuards(AuthGuard)
  async getPosts(@Req() req: any) {
    const department = req.user?.department || req.user?.depId || '';
    return this.activityService.findAll(department);
  }

  @Post('upload-image')
  async uploadImage(@Body() body: { image: string }) {
    const buffer = Buffer.from(body.image, 'base64');
    const saved = await this.imageService.save(buffer);
    return { id: saved.id, url: `/activity/image/${saved.id}` };
  }

  @Get('image/:id')
  async getImage(@Param('id') id: string, @Res() res: Response) {
    const stream = await this.imageService.stream(id);
    res.set('Content-Type', 'image/webp');
    stream.pipe(res);
  }
}
