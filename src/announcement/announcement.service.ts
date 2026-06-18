import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Announcement, AnnouncementDocument } from './schema/announcement.schema';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { Department, DepartmentDocument } from 'src/department/schema/department.schema';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class AnnouncementService {
  private logger = new Logger('AnnouncementService');

  constructor(
    @InjectModel(Announcement.name)
    private announcementModel: Model<AnnouncementDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Department.name) private departmentModel: Model<DepartmentDocument>,
    private notificationService: NotificationService,
  ) {}

  async getAnnouncements(
    teacherId?: string,
    className?: string,
    creatorRole?: string,
    userId?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (teacherId) {
      this.validateObjectId(teacherId, 'Invalid teacher ID');
      filter.teacherId = new Types.ObjectId(teacherId);
    }
    if (className) {
      filter.classNames = className;
    }
    if (creatorRole) {
      filter.creatorRole = creatorRole;
    }

    // Smart filtering: if no explicit className provided and user is student,
    // build className from their profile
    if (!className && userId) {
      const user = await this.userModel
        .findById(userId)
        .populate('department', 'code')
        .lean();
      if (user && ['student'].includes(user.role)) {
        const dept = (user as any).department;
        const deptCode = dept?.code || '';
        const category = user.category || '';
        const session = user.session || '';
        const userClass = user.class || '';
        const userClassName = `${category}-${deptCode}-${session}-${userClass}`;
        filter.classNames = userClassName;
      }
    }

    let announcements = await this.announcementModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate({ path: 'teacherId', select: 'name' })
      .populate({ path: 'createdBy', select: 'name role' })
      .lean();

    if (announcements.length === 0) {
      return { message: 'No announcements found', announcements: [] };
    }

    // Check read status and mark as read
    if (userId) {
      const unreadIds: Types.ObjectId[] = [];

      announcements = announcements.map((a: any) => {
        const isRead = (a.readBy || []).some(
          (id: Types.ObjectId) => id.toString() === userId,
        );
        if (!isRead) {
          unreadIds.push(a._id);
        }
        return { ...a, isRead };
      });

      // Mark unread as read in background
      if (unreadIds.length > 0) {
        this.announcementModel.updateMany(
          { _id: { $in: unreadIds } },
          { $addToSet: { readBy: new Types.ObjectId(userId) } },
        ).catch(() => {}); // fire and forget
      }
    }

    return { count: announcements.length, announcements };
  }

  async createAnnouncement(dto: CreateAnnouncementDto, createdBy: string, creatorRole: string) {
    try {
      this.validateObjectId(dto.teacherId, 'Invalid teacher ID');
      this.validateObjectId(createdBy, 'Invalid creator ID');

      // Validate teacher ID exists
      const teacher = await this.userModel
        .findById(dto.teacherId)
        .lean();
      if (!teacher) {
        throw new BadRequestException('Invalid teacher');
      }

      // Get creator's info for notifications
      const creator = await this.userModel.findById(createdBy).lean();
      if (!creator) {
        throw new BadRequestException('Invalid creator');
      }

      const announcement = new this.announcementModel({
        teacherId: new Types.ObjectId(dto.teacherId),
        classNames: Array.isArray(dto.className) ? dto.className : [dto.className],
        title: dto.title,
        description: dto.description,
        creatorRole: creatorRole,
        createdBy: new Types.ObjectId(createdBy),
      });

      await announcement.save();

      // ============================================================
      // 📢 SEND NOTIFICATIONS TO STUDENTS
      // After announcement is saved, notify all students of those classes
      // ============================================================

      const targetClasses = Array.isArray(dto.className) ? dto.className : [dto.className];

      // Send notifications asynchronously (don't wait)
      this.notificationService
        .sendToClass(
          targetClasses,
          {
            senderId: createdBy,
            senderName: creator.name || 'Admin',
            senderRole: creatorRole,
          },
          dto.title,
          dto.description,
          'announcement',
          {
            announcementId: announcement._id.toString(),
            classNames: targetClasses,
          },
        )
        .then((result) => {
          this.logger.log(
            `📢 Announcement notifications sent: ${result.notificationsCreated} created, ${result.studentsNotified} students notified`,
          );
        })
        .catch((err) => {
          this.logger.error('Failed to send notifications', err);
        });

      return {
        message: 'Announcement created successfully',
        announcement,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      if (error?.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(
          (e: any) => e.message,
        );
        throw new BadRequestException({
          message: 'Validation failed',
          errors: messages,
        });
      }

      throw new InternalServerErrorException('Something went wrong');
    }
  }

  async deleteAnnouncement(announcementId: string, userId: string, userRole: string) {
    this.validateObjectId(announcementId, 'Invalid announcement ID');

    const announcement = await this.announcementModel.findById(announcementId).lean();
    if (!announcement) {
      throw new BadRequestException('Announcement not found');
    }

    // Only creator or admin can delete
    const isCreator = announcement.createdBy.toString() === userId;
    const isAdmin = userRole === 'admin';

    if (!isCreator && !isAdmin) {
      throw new BadRequestException('You are not authorized to delete this announcement');
    }

    await this.announcementModel.findByIdAndDelete(announcementId);
    return { message: 'Announcement deleted successfully' };
  }

  private validateObjectId(id: string, message: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(message);
    }
  }
}
