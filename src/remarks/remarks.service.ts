import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Remark, RemarkDocument, RemarkEntityType } from './schema/remark.schema';
import { User, UserDocument } from '../user/schema/user.schema';
import { NotificationService } from 'src/notification/notification.service';

@Injectable()
export class RemarksService {
  private logger = new Logger('RemarksService');

  constructor(
    @InjectModel(Remark.name) private remarkModel: Model<RemarkDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private notificationService: NotificationService,
  ) {}

  async createRemark(
    entityType: string,
    entityId: string,
    userId: string,
    text?: string,
  ) {
    // Fetch user details
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // For 'general' entity type, use entityId as-is (not a MongoDB ObjectId)
    const isGeneral = entityType === 'general';
    const remark = new this.remarkModel({
      entityType: entityType as RemarkEntityType,
      entityId: isGeneral ? entityId : new Types.ObjectId(entityId),
      authorId: new Types.ObjectId(userId),
      authorName: user.name,
      authorRole: user.role,
      text: text || '',
    });

    const saved = await remark.save();

    // Notify the student when a remark is created on their record.
    // Mobile opens RemarksScreen when data.notification_type === '13'.
    if (!isGeneral && entityType === RemarkEntityType.STUDENT) {
      this.notificationService
        .create({
          userId: entityId,
          senderId: userId,
          senderName: user.name,
          senderRole: user.role,
          type: 'general',
          title: 'New Remark',
          message: text?.trim() || 'You have a new remark',
          data: {
            notification_type: '13',
            entityType,
            entityId,
            authorName: user.name,
          },
          classNames: [],
        })
        .catch((err) => this.logger.error(`Remark notification failed: ${err}`));
    }

    return saved;
  }

  async getRemarksByEntity(entityType: RemarkEntityType, entityId: string) {
    // For 'general' entity type, use entityId as-is (not a MongoDB ObjectId)
    const isGeneral = entityType === RemarkEntityType.GENERAL;
    return this.remarkModel
      .find({
        entityType,
        entityId: isGeneral ? entityId : new Types.ObjectId(entityId),
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  async getAllRemarks(entityType?: RemarkEntityType) {
    const query = entityType ? { entityType } : {};
    return this.remarkModel
      .find(query)
      .sort({ createdAt: -1 })
      .exec();
  }

  async deleteRemark(remarkId: string, userId: string, userRole: string) {
    const remark = await this.remarkModel.findById(remarkId).exec();
    if (!remark) {
      throw new NotFoundException('Remark not found');
    }

    // Only author or admin/hod can delete
    if (remark.authorId.toString() !== userId && !['admin', 'hod'].includes(userRole)) {
      throw new NotFoundException('Not authorized to delete this remark');
    }

    await this.remarkModel.findByIdAndDelete(remarkId).exec();
    return { message: 'Remark deleted successfully' };
  }
}