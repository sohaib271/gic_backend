import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { RolesGuard } from 'src/others-stuff/guards/roles.guard';
import { Roles } from 'src/others-stuff/guards/roles.decorator';
import { SettingsService, APP_SETTING_DEFAULTS } from './settings.service';

@UseGuards(AuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ── Global settings (existing) ──

  @Get(':key')
  async getSetting(@Param('key') key: string) {
    const value = await this.settingsService.getSetting(key);
    return { key, value: value ?? true };
  }

  @Patch(':key')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  updateSetting(
    @Param('key') key: string,
    @Body('value') value: any,
    @Req() req: any,
  ) {
    return this.settingsService.setSetting(key, value, req.user);
  }

  // ── Department-specific settings ──

  /**
   * Get a setting for a specific department.
   * HODs can only read their own department's settings.
   * Admins can read any department's settings.
   */
  @Get('department/:departmentId/:key')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  async getDepartmentSetting(
    @Param('departmentId') departmentId: string,
    @Param('key') key: string,
    @Req() req: any,
  ) {
    this.assertDepartmentAccess(req.user, departmentId);
    const value = await this.settingsService.getDepartmentSetting(key, departmentId);
    return { key, departmentId, value };
  }

  /**
   * Get all settings for a specific department in one call.
   * HODs can only read their own department's settings.
   */
  @Get('department/:departmentId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  async getDepartmentSettings(
    @Param('departmentId') departmentId: string,
    @Req() req: any,
  ) {
    this.assertDepartmentAccess(req.user, departmentId);
    const keys = Object.keys(APP_SETTING_DEFAULTS);
    const values = await this.settingsService.getDepartmentSettings(keys, departmentId);
    return { departmentId, settings: values };
  }

  /**
   * Set a department-specific setting.
   * HODs can only set their own department's settings.
   */
  @Patch('department/:departmentId/:key')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  updateDepartmentSetting(
    @Param('departmentId') departmentId: string,
    @Param('key') key: string,
    @Body('value') value: any,
    @Req() req: any,
  ) {
    return this.settingsService.setDepartmentSetting(key, value, departmentId, req.user);
  }

  /**
   * Remove a department-specific override (falls back to global).
   * HODs can only delete their own department's settings.
   */
  @Delete('department/:departmentId/:key')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  deleteDepartmentSetting(
    @Param('departmentId') departmentId: string,
    @Param('key') key: string,
    @Req() req: any,
  ) {
    return this.settingsService.deleteDepartmentSetting(key, departmentId, req.user);
  }

  /**
   * Admins can access any department; HODs only their own.
   */
  private assertDepartmentAccess(user: any, departmentId: string): void {
    if (user.role === 'admin') return;
    if (user.department?.toString() === departmentId) return;
    throw new ForbiddenException('You can only access your own department');
  }
}
