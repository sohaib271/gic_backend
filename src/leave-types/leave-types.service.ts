import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LeaveType, LeaveTypeDocument } from './schema/leave-type.schema';

@Injectable()
export class LeaveTypesService {
  constructor(
    @InjectModel(LeaveType.name)
    private readonly leaveTypeModel: Model<LeaveTypeDocument>,
  ) {}

  async createLeaveType(name: string, userRole: string) {
    if (userRole !== 'admin') {
      throw new ForbiddenException('Only admin can add leave types');
    }
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new BadRequestException('Leave type name is required');
    }
    if (trimmed.length > 50) {
      throw new BadRequestException('Leave type name must not exceed 50 characters');
    }

    const existing = await this.leaveTypeModel
      .findOne({ name: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
      .exec();

    if (existing) {
      throw new ConflictException(`Leave type "${trimmed}" already exists`);
    }

    const created = await this.leaveTypeModel.create({ name: trimmed });
    return created;
  }

  async getAllLeaveTypes() {
    return this.leaveTypeModel.find().sort({ createdAt: 1 }).exec();
  }

  async deleteLeaveType(leaveTypeId: string, userRole: string) {
    if (userRole !== 'admin') {
      throw new ForbiddenException('Only admin can delete leave types');
    }
    if (!Types.ObjectId.isValid(leaveTypeId)) {
      throw new BadRequestException('Invalid leave type id');
    }

    const deleted = await this.leaveTypeModel
      .findByIdAndDelete(new Types.ObjectId(leaveTypeId))
      .exec();

    if (!deleted) {
      throw new NotFoundException('Leave type not found');
    }

    return { message: 'Leave type deleted successfully' };
  }
}