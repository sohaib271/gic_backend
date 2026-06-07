import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from 'src/auth/auth.module';
import { Class, ClassSchema } from 'src/class/schema/class.schema';
import { User, UserSchema } from 'src/user/schema/user.schema';
import { TeacherAttendance, TeacherAttendanceSchema } from './schema/teacherAttendance';

import { TeacherController } from './teacher.controller';
import { TeacherService } from './teacher.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Class.name, schema: ClassSchema },
      { name: TeacherAttendance.name, schema: TeacherAttendanceSchema },
    ]),
  ],
  controllers: [TeacherController],
  providers: [TeacherService],
  exports: [TeacherService],
})
export class TeacherModule {}
