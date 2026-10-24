import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityService } from './activity.service';
import { ActivityImageService } from './activity-image.service';
import { ActivityController } from './activity.controller';
import { Activity, ActivitySchema } from './schema/activity.schema';
import { Department, DepartmentSchema } from 'src/department/schema/department.schema';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { User, UserSchema } from 'src/user/schema/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Activity.name, schema: ActivitySchema }, { name: User.name, schema: UserSchema }, { name: Department.name, schema: DepartmentSchema }]),
    AuthModule,
    NotificationModule,
  ],
  providers: [ActivityService, ActivityImageService],
  controllers: [ActivityController],
  exports: [ActivityService],
})
export class ActivityModule {}