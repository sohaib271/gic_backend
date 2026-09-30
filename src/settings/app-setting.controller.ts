import { Controller, Get, Injectable } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { SettingsService, APP_SETTING_DEFAULTS } from './settings.service';

/**
 * Read-only view of the app-wide toggles the clients need on startup.
 *
 * Mobile reads this to decide whether the "apply for leave" action should be
 * offered at all, which is why the whole set comes back in one response
 * instead of one request per key.
 */
@Controller('app-setting')
@UseGuards(AuthGuard)
export class AppSettingController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getAppSettings() {
    const keys = Object.keys(APP_SETTING_DEFAULTS);
    const values = await this.settingsService.getSettings(keys);

    // Only known keys are returned, so a stray setting row can never leak
    // through this endpoint, and every consumer always gets a boolean.
    return keys.reduce(
      (acc, key) => {
        acc[key] = values[key] ?? APP_SETTING_DEFAULTS[key];
        return acc;
      },
      {} as Record<string, boolean>,
    );
  }
}
