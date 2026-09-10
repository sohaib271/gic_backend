import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeeController } from './fee.controller';
import { FeeService } from './fee.service';
import { Fee, FeeSchema } from './fee.schema';
import { User, UserSchema } from 'src/user/schema/user.schema';
import { Department, DepartmentSchema } from 'src/department/schema/department.schema';
import { Class, ClassSchema } from 'src/class/schema/class.schema';
import { NotificationModule } from 'src/notification/notification.module';
import { AuthModule } from 'src/auth/auth.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [
    AuthModule,
    UserModule,
    NotificationModule,
    MongooseModule.forFeature([
      { name: Fee.name, schema: FeeSchema },
      { name: User.name, schema: UserSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Class.name, schema: ClassSchema },
    ]),
  ],
  controllers: [FeeController],
  providers: [FeeService],
  exports: [FeeService],
})
export class FeeModule {}