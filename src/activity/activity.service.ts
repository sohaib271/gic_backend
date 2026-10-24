import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Activity, ActivityDocument } from './schema/activity.schema';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { Department, DepartmentDocument } from 'src/department/schema/department.schema';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class ActivityService {
  private logger = new Logger('ActivityService');
  constructor(
    @InjectModel(Activity.name) private activityModel: Model<ActivityDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Department.name) private departmentModel: Model<DepartmentDocument>,
    private notificationService: NotificationService,
  ) {}

  async create(dto: any) {
    const created = new this.activityModel(dto);
    const saved = await created.save();

    // If posted by HOD, notify all users of that department
    try {
      let isHodFlag = dto.role === 'hod' || dto.isHod === true || dto.isHod === 'true' || dto.role === 'HOD';
      if (!isHodFlag && (dto.senderId || dto.userId)) {
        try {
          const u = await this.userModel.findById(dto.senderId || dto.userId).select('role isHod department').lean();
          if (u && (u.isHod || u.role === 'hod' || u.role === 'HOD')) {
            isHodFlag = true;
            if (!dto.department && u.department) dto.department = u.department;
          }
        } catch(e) {}
      }
      this.logger.log(`activity post: sender=${dto.senderId||dto.userId} role=${dto.role} isHod=${dto.isHod} flag=${isHodFlag}`);
      if (isHodFlag) {
        const deptId = dto.department || dto.depId || dto.departmentId;
        let users: any[] = [];
        if (deptId) {
          try {
            users = await this.userModel.find({ department: new Types.ObjectId(deptId) }).select('_id name department').exec();
          } catch (e) {
            // ignore
          }
          if (!users.length) {
            users = await this.userModel.find({ department: deptId }).select('_id name department').exec();
          }
          if (!users.length) {
            users = await this.userModel.find({ deptId: deptId }).select('_id name department').exec();
          }
        } else {
          users = await this.userModel.find({}).select('_id name department').exec();
        }
        const userIds = users.map((u: any) => u._id.toString()).filter((id: string) => id && id !== (dto.senderId || dto.userId || ''));
        this.logger.log(`activity notify: dept=${deptId} users=${users.length} filtered=${userIds.length} ids=${userIds.join(',')}`);
        if (userIds.length) {
          await this.notificationService.createBulk({
            userIds,
            senderId: dto.senderId || dto.userId || '',
            senderName: dto.name || 'HOD',
            senderRole: dto.role || 'hod',
            type: 'activity',
            title: dto.title || 'New Activity Post Uploaded',
            message: dto.description || '',
            data: { activityId: saved._id.toString(), notification_type: '30' },
            classNames: dto.classNames || [],
          });
        }
      }
    } catch (e) {
      // don't fail post
    }

    return saved;
  }

  async findAll(departmentId?: string) {
    let depCode: string | undefined;
    if (departmentId) {
      try {
        const dept = await this.departmentModel
          .findById(departmentId)
          .select('code')
          .lean();
        depCode = dept?.code;
      } catch (e) {
        // ignore lookup errors, fall back to no filter
      }
    }

    const query: any = {};
    if (depCode) {
      query.dep = depCode;
    }
    return this.activityModel.find(query).sort({ createdAt: -1 }).exec();
  }
}