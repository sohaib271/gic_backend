import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Class, ClassDocument } from '../schema/class.schema';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { NotificationService } from 'src/notification/notification.service';

@Injectable()
export class ClassStartNotificationTask {
  private readonly logger = new Logger(ClassStartNotificationTask.name);

  constructor(
    @InjectModel(Class.name)
    private readonly classModel: Model<ClassDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly notificationService: NotificationService,
  ) {}

  // Har minute check karo — kya kisi class ka waqt abhi shuru ho raha hai (PKT)
  @Cron(CronExpression.EVERY_MINUTE)
  async handleClassStart(): Promise<void> {
    try {
      // Current PKT time (UTC+5)
      const now = new Date();
      const pktOffsetMs = 5 * 60 * 60 * 1000;
      const pktDate = new Date(now.getTime() + pktOffsetMs);

      const pktTotalMinutes =
        pktDate.getUTCHours() * 60 + pktDate.getUTCMinutes();
      const currentTime = `${String(
        Math.floor(pktTotalMinutes / 60),
      ).padStart(2, '0')}:${String(pktTotalMinutes % 60).padStart(2, '0')}`;

      const dayNames = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      const currentDay = dayNames[pktDate.getUTCDay()];

      this.logger.log(
        `🔔 Checking class starts for ${currentDay} at ${currentTime} PKT`,
      );

      // Fetch all classes with populated teacher info + students
      const classes = await this.classModel
        .find({})
        .populate({ path: 'assignes.teacherId', select: 'name lastName role department' })
        .lean();

      if (!classes.length) {
        return;
      }

      // Find a system sender (admin/HOD) for notification senderId
      const systemUser = await this.userModel
        .findOne({ role: { $in: ['admin', 'hod'] } })
        .select('_id')
        .lean();

      if (!systemUser) {
        this.logger.warn('No admin/HOD found to use as notification sender');
        return;
      }
      const senderId = systemUser._id.toString();

      // Collect all notifications to send
      const notifications: Array<{
        userIds: string[];
        title: string;
        message: string;
        data: Record<string, any>;
        classNames: string[];
      }> = [];

      for (const cls of classes) {
        const className = cls.className;
        const classId = cls._id.toString();
        const students = (cls.classStudents || []).map((id: any) =>
          id.toString(),
        );

        // Find department for HOD notification
        const departmentId = (cls as any)?.departmentId
          ? (cls as any).departmentId.toString()
          : null;

        for (const assignee of (cls.assignes || [])) {
          const teacher = assignee.teacherId as any;
          const teacherId = assignee.teacherId?.toString();
          const teacherName = teacher
            ? `${teacher.name || ''} ${teacher.lastName || ''}`.trim() ||
              'Teacher'
            : 'Teacher';

          for (const schedule of (assignee.schedule || [])) {
            if (
              schedule.day === currentDay &&
              schedule.startTime === currentTime
            ) {
              const subjectName =
                schedule.subject || assignee.subject || 'Subject';

              // 1. Notify all students of this class
              if (students.length > 0) {
                notifications.push({
                  userIds: students,
                  title: '🔔 Class Started',
                  message: `Your class "${className}" is starting now. Professor: ${teacherName} (${subjectName})`,
                  data: {
                    notification_type: '24',
                    classId,
                    className,
                    teacherId,
                    teacherName,
                    subject: subjectName,
                    day: currentDay,
                    startTime: currentTime,
                    action: 'class_started',
                  },
                  classNames: [className],
                });
              }

              // 2. Notify the teacher
              if (teacherId) {
                notifications.push({
                  userIds: [teacherId],
                  title: '🔔 Class Started',
                  message: `Your class "${className}" is starting now. (${subjectName})`,
                  data: {
                    notification_type: '24',
                    classId,
                    className,
                    teacherId,
                    teacherName,
                    subject: subjectName,
                    day: currentDay,
                    startTime: currentTime,
                    action: 'class_started',
                  },
                  classNames: [className],
                });
              }

              // 3. Notify HOD of the department
              if (departmentId) {
                const hods = await this.userModel
                  .find({
                    isHod: true,
                    department: new Types.ObjectId(departmentId),
                    role: 'proff',
                  })
                  .select('_id')
                  .lean();

                const hodIds = hods.map((h) => h._id.toString());

                if (hodIds.length > 0) {
                  notifications.push({
                    userIds: hodIds,
                    title: '🔔 Class Started',
                    message: `Class "${className}" has started. Professor: ${teacherName} (${subjectName})`,
                    data: {
                      notification_type: '24',
                      classId,
                      className,
                      teacherId,
                      teacherName,
                      subject: subjectName,
                      day: currentDay,
                      startTime: currentTime,
                      action: 'class_started',
                    },
                    classNames: [className],
                  });
                }
              }

              break; // One matching schedule per teacher per class is enough
            }
          }
        }
      }

      // Send all collected notifications
      let sentCount = 0;
      for (const notif of notifications) {
        try {
          await this.notificationService.createBulk({
            userIds: notif.userIds,
            senderId,
            senderName: 'School System',
            senderRole: 'admin',
            type: 'class',
            title: notif.title,
            message: notif.message,
            data: notif.data,
            classNames: notif.classNames,
          });
          sentCount++;
        } catch (err) {
          this.logger.error(
            `Failed to send class start notification: ${err.message}`,
          );
        }
      }

      this.logger.log(
        `✅ Class start notifications processed: ${sentCount} groups sent`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Class start notification task failed: ${error.message}`,
      );
    }
  }
}
