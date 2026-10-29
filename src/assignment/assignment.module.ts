import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { NotificationModule } from 'src/notification/notification.module';
import { Class, ClassSchema } from 'src/class/schema/class.schema';
import { User, UserSchema } from 'src/user/schema/user.schema';
import { AssignmentController } from './assignment.controller';
import { AssignmentService } from './assignment.service';
import { AssignmentFileService } from './assignment-file.service';
import { Assignment, AssignmentSchema } from './schema/assignment.schema';
import { Submission, SubmissionSchema } from './schema/submission.schema';

@Module({
  imports: [
    // AuthGuard needs the User model registered.
    AuthModule,
    NotificationModule,
    MongooseModule.forFeature([
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Submission.name, schema: SubmissionSchema },
      { name: Class.name, schema: ClassSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AssignmentController],
  providers: [AssignmentService, AssignmentFileService],
  exports: [AssignmentService],
})
export class AssignmentModule {}
