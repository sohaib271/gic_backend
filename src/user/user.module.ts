import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User, UserSchema } from './schema/user.schema';
import { AuthModule } from 'src/auth/auth.module';
import { Department, DepartmentSchema } from 'src/department/schema/department.schema';


@Module({
  imports: [AuthModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema },{name:Department.name,schema:DepartmentSchema}]),
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
