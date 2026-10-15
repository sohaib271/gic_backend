import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StruckOff, StruckOffDocument } from '../schema/struckoff.schema';
import { User, UserDocument } from 'src/user/schema/user.schema';

@Injectable()
export class StruckOffExpirationTask {
  private readonly logger = new Logger(StruckOffExpirationTask.name);

  constructor(
    @InjectModel(StruckOff.name)
    private readonly struckOffModel: Model<StruckOffDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  // Har ghante check karo — kya kisi student ki strike-off period expire ho chuki hai
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredStruckOff(): Promise<void> {
    try {
      const now = new Date();
      const expiredRecords = await this.struckOffModel
        .find({
          'currentStatus.status': 'struck_off',
          'currentStatus.end': { $ne: null, $lt: now },
        })
        .lean();

      if (expiredRecords.length === 0) {
        this.logger.log('No expired struck-off records found.');
        return;
      }

      let count = 0;
      for (const record of expiredRecords) {
        const reinstateLog = {
          status: 'reinstated',
          reason: 'Auto-reinstated: strike-off period expired',
          start: null,
          end: null,
          actionBy: record.currentStatus?.actionBy ?? null,
        };

        await this.struckOffModel.updateOne(
          { studentId: record.studentId },
          {
            $set: { currentStatus: null },
            $push: { history: reinstateLog },
          },
        );

        await this.userModel.updateOne(
          { _id: record.studentId },
          { $set: { struckOff: false } },
        );

        count++;
      }

      this.logger.log(
        `Auto-reinstated ${count} student(s) whose strike-off period has expired.`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process expired struck-off records: ${error.message}`,
      );
    }
  }
}
