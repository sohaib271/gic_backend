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
        // Use student's category, fallback to department's category
        const rawCategory = user.category || dept?.category || '';
        
        // Normalize category like Flutter does: bs_adp -> BS, adp -> ADP, etc.
        const category = this.formatCategory(rawCategory);
        
        const sessionStr = user.session || '';
        const userClass = user.class || '';
        
        // Convert session "2024-2028" to "2428" format
        // Handle various session formats
        let sessionCode = sessionStr;
        const sessionMatch = sessionStr.match(/(\d{4})-(\d{4})/);
        if (sessionMatch) {
          const startYear = sessionMatch[1];
          const endYear = sessionMatch[2];
          // Take last 4 digits of start (24) and last digit of end (8) = "2428"
          // Or use both years' last 2 digits combined
          sessionCode = startYear.slice(-2) + endYear.slice(-2);
        }
        
        // Build className like: BS-IT-2428-IV
        const userClassName = `${category}-${deptCode}-${sessionCode}-${userClass}`;
        filter.classNames = userClassName;
      }
      // For admin, hod, prof, prof - show ALL announcements (no className filter)
      // So we don't add className filter for non-students
    }

    let announcements = await this.announcementModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate({ path: 'teacherId', select: 'name' })
      .populate({ path: 'createdBy', select: 'name role' })
      .lean();

    // Always return results if found, regardless of user role
    if (announcements.length === 0 && Object.keys(filter).length === 0) {
      // If no filters applied and no announcements found, still return empty array
      return { message: 'No announcements found', announcements: [] };
    }

    // Check read status (DO NOT auto-mark as read here)
    // Read status will be marked only when user opens the detail screen
    if (userId) {
      announcements = announcements.map((a: any) => {
        const isRead = (a.readBy || []).some(
          (id: Types.ObjectId) => id.toString() === userId,
        );
        return { ...a, isRead };
      });
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

  /**
   * Mark an announcement as read by the user
   * Called when user opens the detail screen
   */
  async markAsRead(announcementId: string, userId: string) {
    this.validateObjectId(announcementId, 'Invalid announcement ID');

    const announcement = await this.announcementModel.findById(announcementId).lean();
    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    // Add user to readBy array if not already there
    await this.announcementModel.updateOne(
      { _id: new Types.ObjectId(announcementId) },
      { $addToSet: { readBy: new Types.ObjectId(userId) } },
    );

    return { message: 'Marked as read' };
  }

  /**
   * Normalize category to display format (matches Flutter _formatCategory)
   * bs -> BS, adp -> ADP, intermediate -> Intermediate, bs_adp -> BS
   */
  private formatCategory(value: string): string {
    const normalized = (value || '').trim().toLowerCase();
    switch (normalized) {
      case 'bs':
        return 'BS';
      case 'adp':
        return 'ADP';
      case 'intermediate':
        return 'Intermediate';
      default:
        // Handle bs_adp -> BS, etc.
        if (normalized.startsWith('bs')) return 'BS';
        if (normalized.startsWith('adp')) return 'ADP';
        if (normalized.includes('intermediate')) return 'Intermediate';
        if (!value || value.trim() === '') return '';
        return value.trim()[0].toUpperCase() + value.trim().substring(1);
    }
  }
}
