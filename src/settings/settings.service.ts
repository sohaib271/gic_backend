import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Setting, SettingDocument } from './schema/setting.schema';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { UserRoleEnum } from 'src/user/enum/UserRole.enum';

/** The caller's identity, as the auth guard attaches it to the request. */
type Actor = { sub: string; role?: string };

/**
 * App-wide toggles and the value each one falls back to when it has never
 * been written. Everything stays enabled by default so that adding a key to
 * the store does not silently switch off a live feature.
 */
export const APP_SETTING_DEFAULTS: Record<string, boolean> = {
  is_apply_leave_enable: true,
  is_chat_enabled: true,
  is_push_noti_enable: true,
};

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Setting.name)
    private readonly settingModel: Model<SettingDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async getSetting(key: string, defaultValue: any = null) {
    const doc = await this.settingModel.findOne({ key }).exec();
    return doc ? doc.value : defaultValue;
  }

  /** Fetches several settings in one query instead of one round trip per key. */
  async getSettings(keys: string[]): Promise<Record<string, any>> {
    const docs = await this.settingModel.find({ key: { $in: keys } }).lean().exec();
    return docs.reduce(
      (acc, doc) => {
        acc[doc.key] = doc.value;
        return acc;
      },
      {} as Record<string, any>,
    );
  }

  /**
   * Reads a setting for a specific department. Falls back to the global
   * (departmentId = null) row when no department-specific override exists,
   * then to the hardcoded default.
   */
  async getDepartmentSetting(
    key: string,
    departmentId?: string | null,
  ): Promise<any> {
    if (departmentId) {
      const deptDoc = await this.settingModel
        .findOne({ key, departmentId: new Types.ObjectId(departmentId) })
        .lean()
        .exec();
      if (deptDoc) return deptDoc.value;
    }

    // Fall back to global
    const globalDoc = await this.settingModel
      .findOne({ key, departmentId: null })
      .lean()
      .exec();
    return globalDoc?.value ?? APP_SETTING_DEFAULTS[key] ?? null;
  }

  /**
   * Reads multiple settings for a specific department in one query.
   * Only department-specific overrides are used — there is no global
   * fallback. Missing keys fall back to the hardcoded default.
   */
  async getDepartmentSettings(
    keys: string[],
    departmentId?: string | null,
  ): Promise<Record<string, any>> {
    const result: Record<string, any> = {};

    // Fetch department-specific overrides only — no global (departmentId=null)
    const filter: any = { key: { $in: keys } };
    if (departmentId) {
      filter.departmentId = new Types.ObjectId(departmentId);
    } else {
      // No department specified: no override can exist, return defaults
      for (const key of keys) {
        result[key] = APP_SETTING_DEFAULTS[key] ?? null;
      }
      return result;
    }

    const docs = await this.settingModel.find(filter).lean().exec();

    for (const doc of docs) {
      result[doc.key] = doc.value;
    }

    for (const key of keys) {
      if (result[key] === undefined) {
        result[key] = APP_SETTING_DEFAULTS[key] ?? null;
      }
    }

    return result;
  }

  /**
   * Admins and department HODs may both change settings. The HOD check reads
   * the user record instead of trusting the token, since the JWT carries only
   * `sub` and `role` and cannot express "is a head of department".
   */
  async setSetting(key: string, value: any, actor: Actor) {
    await this.assertCanUpdate(actor);

    const doc = await this.settingModel
      .findOneAndUpdate(
        { key },
        { value },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    return doc;
  }

  /**
   * Sets a department-specific setting. Admins can set for any department;
   * HODs can only set for their own department.
   */
  async setDepartmentSetting(
    key: string,
    value: any,
    departmentId: string,
    actor: Actor,
  ) {
    await this.assertCanUpdate(actor);

    // HODs can only modify their own department's settings
    if (actor.role !== UserRoleEnum.ADMIN) {
      if (actor.role === UserRoleEnum.PROFF && actor.sub) {
        const user = await this.userModel
          .findById(actor.sub)
          .select('department')
          .lean()
          .exec();
        if (user?.department?.toString() !== departmentId) {
          throw new ForbiddenException(
            'You can only modify settings for your own department',
          );
        }
      } else {
        throw new ForbiddenException(
          'Only admin or HOD can update department settings',
        );
      }
    }

    const doc = await this.settingModel
      .findOneAndUpdate(
        { key, departmentId: new Types.ObjectId(departmentId) },
        { value },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    return doc;
  }

  /**
   * Removes a department-specific override, causing the department to fall
   * back to the global setting.
   */
  async deleteDepartmentSetting(
    key: string,
    departmentId: string,
    actor: Actor,
  ) {
    await this.assertCanUpdate(actor);

    // HODs can only delete their own department's settings
    if (actor.role !== UserRoleEnum.ADMIN) {
      if (actor.role === UserRoleEnum.PROFF && actor.sub) {
        const user = await this.userModel
          .findById(actor.sub)
          .select('department')
          .lean()
          .exec();
        if (user?.department?.toString() !== departmentId) {
          throw new ForbiddenException(
            'You can only modify settings for your own department',
          );
        }
      } else {
        throw new ForbiddenException(
          'Only admin or HOD can update department settings',
        );
      }
    }

    await this.settingModel
      .findOneAndDelete({ key, departmentId: new Types.ObjectId(departmentId) })
      .exec();

    return { message: 'Department setting removed, using global default' };
  }

  private async assertCanUpdate(actor: Actor): Promise<void> {
    if (actor?.role === UserRoleEnum.ADMIN) return;

    if (actor?.role === UserRoleEnum.PROFF && actor.sub) {
      const isHod = await this.userModel
        .exists({ _id: actor.sub, role: UserRoleEnum.PROFF, isHod: true });
      if (isHod) return;
    }

    throw new ForbiddenException('Only admin can update settings');
  }
}
