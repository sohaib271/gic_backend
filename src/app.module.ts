import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { DepartmentModule } from './department/department.module';
import { AuthModule } from './auth/auth.module';
import { ClassModule } from './class/class.module';

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
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
