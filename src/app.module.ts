import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { UserModule } from './user/user.module';
import { DepartmentModule } from './department/department.module';
import { AuthModule } from './auth/auth.module';
import { ClassModule } from './class/class.module';
import { AttendenceModule } from './attendence/attendence.module';
import * as dns from "dns"
import { TeacherModule } from './teacher/teacher.module';
import { AnnouncementModule } from './announcement/announcement.module';
import { NotificationModule } from './notification/notification.module';
import { RemarksModule } from './remarks/remarks.module';
dns.setServers(["1.1.1.1","8.8.8.8"]);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
   MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URL') || 'mongodb://localhost:27017/college-db',
      }),
    }),
    UserModule,
    DepartmentModule,
    AuthModule,
    ClassModule,
    AttendenceModule,
    TeacherModule,
    AnnouncementModule,
    NotificationModule,
    RemarksModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
