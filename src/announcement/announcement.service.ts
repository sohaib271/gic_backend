import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Announcement, AnnouncementDocument } from './schema/announcement.schema';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { User, UserDocument } from 'src/user/schema/user.schema';

@Injectable()
export class AnnouncementService {
  constructor(
    @InjectModel(Announcement.name)
    private announcementModel: Model<AnnouncementDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async getAnnouncements(
    teacherId?: string,
    className?: string,
    creatorRole?: string,
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

    const announcements = await this.announcementModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate({ path: 'teacherId', select: 'name' })
      .populate({ path: 'createdBy', select: 'name role' })
      .lean();

    if (announcements.length === 0) {
      return { message: 'No announcements found', announcements: [] };
    }

    return { count: announcements.length, announcements };
  }

  async createAnnouncement(dto: CreateAnnouncementDto, createdBy: string, creatorRole: string) {
    try {
      this.validateObjectId(dto.teacherId, 'Invalid teacher ID');
      this.validateObjectId(createdBy, 'Invalid creator ID');

      // Validate teacher ID exists
      const teacher = await this.userModel
        .exists({ _id: new Types.ObjectId(dto.teacherId) })
        .lean();
      if (!teacher) {
        throw new BadRequestException('Invalid teacher');
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

      return {
        message: 'Announcement created successfully',
        announcement,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException
      ) {
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

  private validateObjectId(id: string, message: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(message);
    }
  }
}