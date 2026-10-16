import { Controller, Get, Query, Injectable, Req } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { SettingsService, APP_SETTING_DEFAULTS } from './settings.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Department } from 'src/department/schema/department.schema';

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
  constructor(
    private readonly settingsService: SettingsService,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<Department>,
  ) {}

  @Get()
  async getAppSettings(
    @Req() req: any,
    @Query('departmentId') departmentId?: string,
  ) {
    const keys = Object.keys(APP_SETTING_DEFAULTS);
    const values = await this.settingsService.getDepartmentSettings(
      keys,
      departmentId ?? null,
    );

    // Only known keys are returned, so a stray setting row can never leak
    // through this endpoint, and every consumer always gets a boolean.
    const settings = keys.reduce(
      (acc, key) => {
        acc[key] = values[key] ?? APP_SETTING_DEFAULTS[key];
        return acc;
      },
      {} as Record<string, boolean>,
    );

    // Resolve department info from the JWT payload (department ObjectId) so the
    // mobile app can show the department name alongside the settings.
    let departmentInfo: any = null;
    const deptId = departmentId ?? req.user?.department;
    if (deptId) {
      const dept = await this.departmentModel
        .findById(deptId)
        .select('name code category')
        .lean();
      if (dept) {
        departmentInfo = {
          _id: deptId,
          name: dept.name,
          code: dept.code,
          category: dept.category,
        };
      }
    }

    return {
      ...settings,
      department: departmentInfo,
    };
  }
}
