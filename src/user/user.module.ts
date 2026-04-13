import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User, UserSchema } from './schema/user.schema';
import { AuthModule } from 'src/auth/auth.module';
import { Department, DepartmentSchema } from 'src/department/schema/department.schema';
import { Class, ClassSchema } from 'src/class/schema/class.schema';


@Module({
  imports: [AuthModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema },{name:Department.name,schema:DepartmentSchema},{name:Class.name,schema:ClassSchema}]),
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
