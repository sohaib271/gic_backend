import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { NotificationModule } from 'src/notification/notification.module';
import { User, UserSchema } from 'src/user/schema/user.schema';
import {
  Department,
  DepartmentSchema,
} from 'src/department/schema/department.schema';
import {
  LeaveType,
  LeaveTypeSchema,
} from 'src/leave-types/schema/leave-type.schema';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import {
  LeaveRequest,
  LeaveRequestSchema,
} from './schema/leave-request.schema';

@Module({
  imports: [
    // AuthModule supplies JwtModule + User model for AuthGuard/RolesGuard
    AuthModule,
    // NotificationService for HOD + student notifications
    NotificationModule,
    MongooseModule.forFeature([
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
      { name: LeaveType.name, schema: LeaveTypeSchema },
      { name: User.name, schema: UserSchema },
      { name: Department.name, schema: DepartmentSchema },
    ]),
  ],
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
