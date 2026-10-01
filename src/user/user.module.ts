import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User, UserSchema } from './schema/user.schema';
import { AuthModule } from 'src/auth/auth.module';
import { Department, DepartmentSchema } from 'src/department/schema/department.schema';
import { Class, ClassSchema } from 'src/class/schema/class.schema';
import { RegistrationToken, RegistrationTokenSchema } from './schema/registration-token.schema';
import { RegistrationService } from './registration.service';
import { RegistrationController } from './registration.controller';


@Module({
  imports: [AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Class.name, schema: ClassSchema },
      { name: RegistrationToken.name, schema: RegistrationTokenSchema },
    ]),
  ],
  controllers: [UserController, RegistrationController],
  providers: [UserService, RegistrationService],
  exports: [UserService],
})
export class UserModule {}
