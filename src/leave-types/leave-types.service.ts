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
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { UserRoleEnum } from 'src/user/enum/UserRole.enum';
import { User, UserDocument } from 'src/user/schema/user.schema';

const ADMIN_ONLY = 'Only admin can manage leave types';

/** The caller's identity, as the auth guard attaches it to the request. */
type Actor = { sub: string; role?: string };

@Injectable()
export class LeaveTypesService {
  constructor(
    @InjectModel(LeaveType.name)
    private readonly leaveTypeModel: Model<LeaveTypeDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async createLeaveType(name: string, actor: Actor) {
    await this.assertCanManage(actor);

    const trimmed = this.normaliseName(name);
    await this.assertNameFree(trimmed);

    return this.leaveTypeModel.create({ name: trimmed });
  }

  /**
   * Students picking a leave type should only see the ones still offered;
   * `?all=true` (admin) also returns retired types.
   */
  async getAllLeaveTypes(includeInactive = false) {
    const filter = includeInactive ? {} : { isActive: { $ne: false } };
    return this.leaveTypeModel
      .find(filter)
      .sort({ createdAt: 1 })
      .lean()
      .exec();
  }

  async getLeaveType(id: string) {
    this.assertObjectId(id);
    const leaveType = await this.leaveTypeModel.findById(id).lean().exec();
    if (!leaveType) {
      throw new NotFoundException('Leave type not found');
    }
    return leaveType;
  }

  async updateLeaveType(id: string, dto: UpdateLeaveTypeDto, actor: Actor) {
    await this.assertCanManage(actor);
    this.assertObjectId(id);

    if (dto.name !== undefined) {
      const trimmed = this.normaliseName(dto.name);
      await this.assertNameFree(trimmed, id);
      dto.name = trimmed;
    }

    if (dto.name === undefined && dto.isActive === undefined) {
      throw new BadRequestException('Nothing to update');
    }

    const updated = await this.leaveTypeModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true })
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Leave type not found');
    }

    return updated;
  }

  async deleteLeaveType(leaveTypeId: string, actor: Actor) {
    await this.assertCanManage(actor);
    this.assertObjectId(leaveTypeId);

    const deleted = await this.leaveTypeModel
      .findByIdAndDelete(new Types.ObjectId(leaveTypeId))
      .exec();

    if (!deleted) {
      throw new NotFoundException('Leave type not found');
    }

    return { message: 'Leave type deleted successfully' };
  }

  // ============================================================
  // HELPERS
  // ============================================================

  /**
   * Leave types are a college-wide catalogue, but a department HOD needs to
   * maintain them for their own staff, so admins and HODs may both manage
   * them. The HOD flag is read from the user record rather than trusted from
   * the token, because the JWT only carries `sub` and `role` — a role string
   * on its own cannot distinguish an HOD from an ordinary professor.
   */
  private async assertCanManage(actor: Actor): Promise<void> {
    if (actor?.role === UserRoleEnum.ADMIN) return;

    if (actor?.role === UserRoleEnum.PROFF && actor.sub) {
      const isHod = await this.userModel
        .exists({ _id: actor.sub, role: UserRoleEnum.PROFF, isHod: true });
      if (isHod) return;
    }

    throw new ForbiddenException(ADMIN_ONLY);
  }

  private assertObjectId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid leave type id');
    }
  }

  private normaliseName(name: string): string {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new BadRequestException('Leave type name is required');
    }
    if (trimmed.length > 50) {
      throw new BadRequestException(
        'Leave type name must not exceed 50 characters',
      );
    }
    return trimmed;
  }

  private async assertNameFree(name: string, exceptId?: string) {
    // `_id` must be omitted entirely when renaming nothing: the driver
    // serialises `undefined` as `null`, which turns the filter into
    // `{ _id: null }` and silently matches nothing.
    const filter: Record<string, any> = {
      name: new RegExp(
        `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        'i',
      ),
    };
    if (exceptId) {
      filter._id = { $ne: new Types.ObjectId(exceptId) };
    }

    const clash = await this.leaveTypeModel
      .findOne(filter)
      .select('_id')
      .lean()
      .exec();

    if (clash) {
      throw new ConflictException(`Leave type "${name}" already exists`);
    }
  }
}
