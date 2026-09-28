/**
 * 📦 MIDTERM MODULE
 * ================
 * Registers the midterm schedule schema alongside the Class/User models the
 * service needs, plus the NotificationModule it publishes through.
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { NotificationModule } from 'src/notification/notification.module';
import { Class, ClassSchema } from 'src/class/schema/class.schema';
import { User, UserSchema } from 'src/user/schema/user.schema';
import {
  MidtermSchedule,
  MidtermScheduleSchema,
} from './schema/midterm-schedule.schema';
import { MidtermController } from './midterm.controller';
import { MidtermService } from './midterm.service';

@Module({
  imports: [
    AuthModule,
    NotificationModule,
    MongooseModule.forFeature([
      { name: MidtermSchedule.name, schema: MidtermScheduleSchema },
      { name: Class.name, schema: ClassSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [MidtermController],
  providers: [MidtermService],
  exports: [MidtermService],
})
export class MidtermModule {}
