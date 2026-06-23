import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Remark, RemarkDocument, RemarkEntityType } from './schema/remark.schema';
import { User, UserDocument } from '../user/schema/user.schema';

@Injectable()
export class RemarksService {
  constructor(
    @InjectModel(Remark.name) private remarkModel: Model<RemarkDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
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

    const remark = new this.remarkModel({
      entityType: entityType as RemarkEntityType,
      entityId: new Types.ObjectId(entityId),
      authorId: new Types.ObjectId(userId),
      authorName: user.name,
      authorRole: user.role,
      text: text || '',
    });

    return remark.save();
  }

  async getRemarksByEntity(entityType: RemarkEntityType, entityId: string) {
    return this.remarkModel
      .find({
        entityType,
        entityId: new Types.ObjectId(entityId),
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