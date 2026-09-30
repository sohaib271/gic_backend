import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
