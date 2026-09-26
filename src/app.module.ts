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
import { FeeModule } from './fee/fee.module';
import { LeaveTypesModule } from './leave-types/leave-types.module';
import { SettingsModule } from './settings/settings.module';
import { SurveyModule } from './survey/survey.module';
// Overriding the system resolvers is only safe when the platform DNS is
// broken. On Render it can hang every outbound lookup (Atlas/host resolution),
// so it stays opt-in via USE_CUSTOM_DNS=true.
if (process.env.USE_CUSTOM_DNS === 'true') {
  dns.setServers(['1.1.1.1', '8.8.8.8']);
}

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
      useFactory: (configService: ConfigService) => {
        const uri = configService.get<string>('MONGODB_URL');

        if (!uri) {
          throw new Error(
            'MONGODB_URL is not set. Add it to your environment (on Render: Environment tab). ' +
              'Without it the app cannot bind a port and Render fails with "Port scan timeout reached".',
          );
        }

        return {
          uri,
          // Fail fast instead of hanging: Nest's mongoose retry defaults
          // (9 attempts x 30s server selection) kept the process alive for
          // minutes with no port bound, which Render reports as a timeout.
          serverSelectionTimeoutMS: 10_000,
          connectTimeoutMS: 10_000,
          maxPoolSize: 10,
          retryAttempts: 2,
          retryDelay: 2000,
          verboseRetryLog: true,
        };
      },
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
    FeeModule,
    LeaveTypesModule,
    SettingsModule,
    SurveyModule,
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
