import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DepartmentController } from './department.controller';
import { DepartmentService } from './department.service';
import { Department, DepartmentSchema } from './schema/department.schema';
import { AuthModule } from 'src/auth/auth.module';
import { User, UserSchema } from 'src/user/schema/user.schema';
import { Class, ClassSchema } from 'src/class/schema/class.schema';
import {
  Attendance,
  AttendenceSchema,
} from 'src/attendence/schema/attendence.schema';
import { Fee, FeeSchema } from 'src/fee/fee.schema';
import {
  LeaveRequest,
  LeaveRequestSchema,
} from 'src/leave/schema/leave-request.schema';
import { Remark, RemarkSchema } from 'src/remarks/schema/remark.schema';
import {
  TeacherAttendance,
  TeacherAttendanceSchema,
} from 'src/teacher/schema/teacherAttendance';
import {
  MidtermSchedule,
  MidtermScheduleSchema,
} from 'src/midterm/schema/midterm-schedule.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Department.name, schema: DepartmentSchema },
      { name: User.name, schema: UserSchema },
      { name: Class.name, schema: ClassSchema },
      { name: Attendance.name, schema: AttendenceSchema },
      { name: Fee.name, schema: FeeSchema },
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
      { name: Remark.name, schema: RemarkSchema },
      { name: TeacherAttendance.name, schema: TeacherAttendanceSchema },
      { name: MidtermSchedule.name, schema: MidtermScheduleSchema },
    ]),
  ],
  controllers: [DepartmentController],
  providers: [DepartmentService],
  exports: [DepartmentService],
})
export class DepartmentModule {}
