import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Announcement, AnnouncementDocument } from './schema/announcement.schema';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class AnnouncementService {
  private logger = new Logger('AnnouncementService');

  constructor(
    @InjectModel(Announcement.name)
    private announcementModel: Model<AnnouncementDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private notificationService: NotificationService,
  ) {}

  async createAnnouncement(dto: CreateAnnouncementDto, createdBy: string, creatorRole: string) {
    try {
      const teacherId = dto.teacherId || createdBy;
      this.validateObjectId(teacherId, 'Invalid teacher ID');
      this.validateObjectId(createdBy, 'Invalid creator ID');

      if (dto.teacherId) {
        const teacher = await this.userModel.findById(dto.teacherId).lean();
        if (!teacher) {
          throw new BadRequestException('Invalid teacher');
        }
      }

      const creator = await this.userModel.findById(createdBy).lean();
      if (!creator) {
        throw new BadRequestException('Invalid creator');
      }

      const announcement = new this.announcementModel({
        teacherId: new Types.ObjectId(teacherId),
        classNames: Array.isArray(dto.className) ? dto.className : [dto.className],
        title: dto.title,
        description: dto.description,
        creatorRole: creatorRole,
        createdBy: new Types.ObjectId(createdBy),
      });

      await announcement.save();

      // ============================================================
      // SEND NOTIFICATIONS TO STUDENTS — stored in `notifications` collection
      // with type='announcement'. All announcement data is in `data` field
      // so GET /notifications?type=announcement returns everything.
      // ============================================================

      const targetClasses = Array.isArray(dto.className) ? dto.className : [dto.className];

      try {
        const result = await this.notificationService.sendToClass(
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
            creatorRole: creatorRole,
            createdBy: createdBy,
            createdAt: announcement.createdAt,
          },
        );

        this.logger.log(
          `Announcement notifications sent: ${result.notificationsCreated} created, ${result.studentsNotified} students notified`,
        );
      } catch (err) {
        // Notification failure should not break announcement creation,
        // but we log it so it's visible in server logs.
        this.logger.error('Failed to send announcement notifications', err);
      }

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

    const isCreator = announcement.createdBy.toString() === userId;
    const isAdmin = userRole === 'admin';

    if (!isCreator && !isAdmin) {
      throw new BadRequestException('You are not authorized to delete this announcement');
    }

    await this.announcementModel.findByIdAndDelete(announcementId);

    // Also delete all related notifications
    await this.notificationService.deleteRelated(userId, { announcementId });

    return { message: 'Announcement deleted successfully' };
  }

  private validateObjectId(id: string, message: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(message);
    }
  }
}
