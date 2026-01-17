import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { DepartmentModule } from './department/department.module';
import { AuthModule } from './auth/auth.module';
import { ClassModule } from './class/class.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/college-db',
    ),
    UserModule,
    DepartmentModule,
    AuthModule,
    ClassModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
