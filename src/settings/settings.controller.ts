import { Controller, Get, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { SettingsService } from './settings.service';

@UseGuards(AuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get(':key')
  async getSetting(@Param('key') key: string) {
    const value = await this.settingsService.getSetting(key);
    return { key, value: value ?? true };
  }

  @Patch(':key')
  updateSetting(
    @Param('key') key: string,
    @Body('value') value: any,
    @Req() req: any,
  ) {
    return this.settingsService.setSetting(key, value, req.user.role);
  }
}