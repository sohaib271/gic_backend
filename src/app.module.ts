import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { DepartmentModule } from './department/department.module';
import { AuthModule } from './auth/auth.module';
import { ClassModule } from './class/class.module';
import { AttendenceModule } from './attendence/attendence.module';
import * as dns from "dns"
import { TeacherModule } from './teacher/teacher.module';
dns.setServers(["1.1.1.1","8.8.8.8"]);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
