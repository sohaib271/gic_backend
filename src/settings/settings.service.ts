import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Setting, SettingDocument } from './schema/setting.schema';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Setting.name)
    private readonly settingModel: Model<SettingDocument>,
  ) {}

  async getSetting(key: string, defaultValue: any = null) {
    const doc = await this.settingModel.findOne({ key }).exec();
    return doc ? doc.value : defaultValue;
  }

  async setSetting(key: string, value: any, userRole: string) {
    if (userRole !== 'admin') {
      throw new ForbiddenException('Only admin can update settings');
    }

    const doc = await this.settingModel
      .findOneAndUpdate(
        { key },
        { value },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    return doc;
  }
}