import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SettingsController } from './settings.controller';
import { AppSettingController } from './app-setting.controller';
import { SettingsService } from './settings.service';
import { Setting, SettingSchema } from './schema/setting.schema';
import { User, UserSchema } from '../user/schema/user.schema';
import { Department, DepartmentSchema } from '../department/schema/department.schema';
import { DepartmentModule } from '../department/department.module';

@Module({
  imports: [
    DepartmentModule,
    MongooseModule.forFeature([
      { name: Setting.name, schema: SettingSchema },
      { name: User.name, schema: UserSchema },
      { name: Department.name, schema: DepartmentSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'default-secret',
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [SettingsController, AppSettingController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}