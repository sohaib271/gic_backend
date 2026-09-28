/**
 * LEAVE SERVICE
 * =============
 * The whole leave lifecycle lives here.
 *
 * 1. apply()       - student applies, the HOD of their department is notified
 * 2. getMyLeaves() - ONE endpoint, role-aware: the token decides what is returned
 * 3. getById()     - single request, permission checked against the token
 * 4. review()      - HOD/admin approves or rejects, student is notified
 * 5. cancel()      - applicant withdraws their own pending request
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LeaveRequest,
  LeaveRequestDocument,
  LeaveStatusEnum,
  LeaveDayPartEnum,
} from './schema/leave-request.schema';
import {
  LeaveType,
  LeaveTypeDocument,
} from 'src/leave-types/schema/leave-type.schema';
import {
  Department,
  DepartmentDocument,
} from 'src/department/schema/department.schema';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { UserRoleEnum } from 'src/user/enum/UserRole.enum';
import { NotificationService } from 'src/notification/notification.service';
import { ApplyLeaveDto, GetLeavesDto, ReviewLeaveDto } from './dto/leave.dto';
import {
  LEAVE_MAX_SPAN_DAYS,
  LEAVE_NOTIFICATION_KIND,
  LEAVE_NOTIFICATION_TYPE,
  LEAVE_PAST_DATE_MESSAGE,
} from './leave.constants';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type Actor = {
  _id: Types.ObjectId;
  name: string;
  lastName?: string;
  specialId?: string;
  role: string;
  isHod?: boolean;
  department?: Types.ObjectId | null;
};

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    @InjectModel(LeaveRequest.name)
    private readonly leaveModel: Model<LeaveRequestDocument>,
    @InjectModel(LeaveType.name)
    private readonly leaveTypeModel: Model<LeaveTypeDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    private readonly notificationService: NotificationService,
  ) {}

  // ============================================================
  // 1. APPLY FOR LEAVE
  // POST /leave
  // ============================================================

  async apply(dto: ApplyLeaveDto, req: any) {
    const actor = await this.loadActor(req);

    if (!actor.department) {
      throw new BadRequestException(
        'Your profile has no department assigned. Contact the admin before applying for leave.',
      );
    }

    const leaveType = await this.leaveTypeModel.findById(dto.leaveType).lean();
    if (!leaveType) {
      throw new NotFoundException('Leave type not found');
    }
    if (leaveType.isActive === false) {
      throw new BadRequestException(
        `Leave type "${leaveType.name}" is no longer available`,
      );
    }

    const { from, to, totalDays } = this.resolveDateRange(
      dto.fromDate,
      dto.toDate,
      dto.dayPart || LeaveDayPartEnum.FULL,
    );

    await this.assertNoOverlap(actor._id, from, to);

    const created = await this.leaveModel.create({
      studentId: actor._id,
      studentName: this.fullName(actor),
      studentSpecialId: actor.specialId || '',
      department: actor.department,
      leaveType: leaveType._id,
      leaveTypeName: leaveType.name,
      fromDate: from,
      toDate: to,
      dayPart: dto.dayPart || LeaveDayPartEnum.FULL,
      totalDays,
      reason: dto.reason.trim(),
      contactNumber: dto.contactNumber || null,
      status: LeaveStatusEnum.PENDING,
    });

    await this.notifyHodOfNewRequest(created, actor);

    this.logger.log(
      `Leave applied by ${this.fullName(actor)} (${totalDays} day(s)) -> status pending`,
    );

    return {
      message: 'Leave applied successfully. Waiting for HOD approval.',
      leave: await this.decorate(created),
    };
  }

  // ============================================================
  // 2. MY LEAVES — ROLE AWARE
  // GET /leave/my_leaves
  // ============================================================

  /**
   * The token decides what comes back, so the mobile app only needs one call:
   *   student        -> scope "own"        (their applications)
   *   proff + isHod  -> scope "department" (their department's students)
   *   admin          -> scope "all"
   * The `role` / `canApply` / `canReview` flags in the response let the app
   * render the right screen without hardcoding anything.
   */
  async getMyLeaves(query: GetLeavesDto, req: any) {
    const actor = await this.loadActor(req);
    const scope = this.resolveScope(actor);

    const filter: Record<string, any> = { ...scope.filter };

    if (query.status) filter.status = query.status;
    if (query.leaveType) filter.leaveType = new Types.ObjectId(query.leaveType);

    // `from`/`fromDate` and `to`/`toDate` are accepted interchangeably
    const fromFilter = query.from || query.fromDate;
    const toFilter = query.to || query.toDate;
    if (fromFilter) filter.toDate = { $gte: new Date(fromFilter) };
    if (toFilter) filter.fromDate = { $lte: new Date(toFilter) };

    // department / studentId filters are only honoured for elevated roles
    if (query.department && scope.canReview) {
      filter.department = new Types.ObjectId(query.department);
    }
    if (query.studentId && scope.canReview) {
      filter.studentId = new Types.ObjectId(query.studentId);
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    const department = await this.departmentInfo(actor.department);

    const [leaves, total, counts] = await Promise.all([
      this.leaveModel
        .find(filter)
        .populate('leaveType', 'name isActive')
        .populate('department', 'name code')
        .populate('studentId', 'name lastName specialId rollNo class email phone image')
        .populate('reviewedBy', 'name lastName role')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.leaveModel.countDocuments(filter),
      this.leaveModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const summary = {
      total,
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
    };
    for (const row of counts) {
      if (row._id in summary) summary[row._id] = row.count;
    }

    return {
      // who the backend thinks the caller is, straight from the token
      role: actor.role,
      roleLabel: this.roleLabel(actor),
      scope: scope.name,
      canApply: scope.canApply,
      canReview: scope.canReview,
      department,
      // what this scope is looking at — handy for the app's heading
      scopeLabel: this.scopeLabel(scope, department),
      summary,
      leaves,
      pagination: {
        total,
        count: leaves.length,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  // ============================================================
  // 3. SINGLE REQUEST
  // GET /leave/:id
  // ============================================================

  async getById(id: string, req: any) {
    this.assertObjectId(id);
    const actor = await this.loadActor(req);

    const leave = await this.leaveModel
      .findById(id)
      .populate('leaveType', 'name isActive')
      .populate('department', 'name code')
      .populate('studentId', 'name lastName specialId rollNo class email phone image')
      .populate('reviewedBy', 'name lastName role')
      .lean();

    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }

    this.assertCanView(leave, actor);

    return leave;
  }

  // ============================================================
  // 4. APPROVE / REJECT
  // PATCH /leave/:id/status
  // ============================================================

  async review(id: string, dto: ReviewLeaveDto, req: any) {
    this.assertObjectId(id);
    const actor = await this.loadActor(req);

    const leave = await this.leaveModel.findById(id);
    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }

    // Only an admin, or the HOD of the applicant's own department, may decide.
    this.assertCanReview(leave, actor);

    if (leave.status !== LeaveStatusEnum.PENDING) {
      throw new ConflictException(
        `This leave has already been ${leave.status} and cannot be changed`,
      );
    }

    leave.status = dto.status;
    leave.reviewedBy = actor._id;
    leave.reviewedByName = this.fullName(actor);
    leave.reviewedAt = new Date();
    leave.decisionNote = dto.note?.trim() || null;
    await leave.save();

    await this.notifyStudentOfDecision(leave, actor);

    this.logger.log(
      `Leave ${leave._id} ${dto.status} by ${this.fullName(actor)}`,
    );

    return {
      message: `Leave ${dto.status} successfully`,
      leave: await this.decorate(leave),
    };
  }

  // ============================================================
  // 5. CANCEL OWN REQUEST
  // PATCH /leave/:id/cancel
  // ============================================================

  async cancel(id: string, req: any) {
    this.assertObjectId(id);
    const actor = await this.loadActor(req);

    const leave = await this.leaveModel.findById(id);
    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }

    if (leave.studentId.toString() !== actor._id.toString()) {
      throw new ForbiddenException('You can only cancel your own leave');
    }

    if (leave.status !== LeaveStatusEnum.PENDING) {
      throw new ConflictException(
        `Only pending leave can be cancelled, this one is ${leave.status}`,
      );
    }

    leave.status = LeaveStatusEnum.CANCELLED;
    leave.cancelledAt = new Date();
    await leave.save();

    // The HOD's inbox no longer contains it, so drop the "new request" ping.
    const approvers = await this.resolveApprovers(actor);
    for (const approver of approvers) {
      this.notificationService
        .deleteRelated(approver._id.toString(), {
          notification_type: LEAVE_NOTIFICATION_TYPE,
          leaveId: leave._id.toString(),
          status: LeaveStatusEnum.PENDING,
        })
        .catch((err) =>
          this.logger.warn(`Leave cancel notification cleanup failed: ${err}`),
        );
    }

    this.logger.log(`Leave ${leave._id} cancelled by ${this.fullName(actor)}`);

    return {
      message: 'Leave cancelled successfully',
      leave: await this.decorate(leave),
    };
  }

  // ============================================================
  // HELPERS: SCOPE / PERMISSION
  // ============================================================

  private async loadActor(req: any): Promise<Actor> {
    const actor = await this.userModel
      .findById(req?.user?.sub)
      .select('_id name lastName specialId role isHod department')
      .lean<Actor>();

    if (!actor) {
      throw new ForbiddenException('User not found');
    }

    return { ...actor, _id: actor._id as Types.ObjectId };
  }

  /**
   * Decides the base filter from the token. This is the single place where
   * "which rows may this caller see" is defined.
   */
  private resolveScope(actor: Actor): {
    name: 'own' | 'department' | 'all';
    filter: Record<string, any>;
    canReview: boolean;
    canApply: boolean;
  } {
    if (actor.role === UserRoleEnum.ADMIN) {
      return {
        name: 'all',
        filter: {},
        canReview: true,
        canApply: true,
      };
    }

    if (actor.isHod === true) {
      if (!actor.department) {
        throw new ForbiddenException(
          'You are marked as HOD but no department is assigned to you',
        );
      }
      return {
        name: 'department',
        filter: { department: actor.department },
        canReview: true,
        canApply: true,
      };
    }

    return {
      name: 'own',
      filter: { studentId: actor._id },
      canReview: false,
      canApply: true,
    };
  }

  /** A student sees their own; an HOD only their own department; admin anything. */
  private assertCanView(
    leave: {
      studentId: any;
      department?: any;
    },
    actor: Actor,
  ): void {
    if (actor.role === UserRoleEnum.ADMIN) return;

    if (leave.studentId?._id?.toString() === actor._id.toString()) return;

    if (actor.isHod === true && actor.department) {
      const leaveDept = leave.department?._id?.toString() ?? leave.department?.toString();
      if (leaveDept === actor.department.toString()) return;
    }

    throw new ForbiddenException('You are not allowed to view this leave');
  }

  private assertCanReview(
    leave: { department?: Types.ObjectId | null },
    actor: Actor,
  ): void {
    if (actor.role === UserRoleEnum.ADMIN) return;

    if (actor.isHod === true && actor.department) {
      if (leave.department?.toString() === actor.department.toString()) return;
      throw new ForbiddenException(
        'You can only decide leaves of your own department',
      );
    }

    throw new ForbiddenException(
      'Only an admin or the HOD of the department can approve or reject leave',
    );
  }

  // ============================================================
  // HELPERS: DATES
  // ============================================================

  private resolveDateRange(
    fromInput: string,
    toInput: string,
    dayPart: LeaveDayPartEnum,
  ): { from: Date; to: Date; totalDays: number } {
    const from = this.startOfDay(new Date(fromInput));
    const to = this.startOfDay(new Date(toInput));

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid leave dates');
    }

    const today = this.startOfDay(new Date());
    if (from < today) {
      throw new BadRequestException(LEAVE_PAST_DATE_MESSAGE);
    }

    if (to < from) {
      throw new BadRequestException('toDate cannot be before fromDate');
    }

    const spanDays = Math.round((to.getTime() - from.getTime()) / MS_PER_DAY) + 1;

    if (spanDays > LEAVE_MAX_SPAN_DAYS) {
      throw new BadRequestException(
        `A single leave application cannot exceed ${LEAVE_MAX_SPAN_DAYS} days`,
      );
    }

    // Half day only makes sense for a single day; a longer range is full days
    // minus half a day.
    const totalDays =
      dayPart === LeaveDayPartEnum.HALF
        ? Math.max(0.5, spanDays - 0.5)
        : spanDays;

    return { from, to, totalDays };
  }

  private startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** Block a second application that overlaps a pending/approved one. */
  private async assertNoOverlap(
    studentId: Types.ObjectId,
    from: Date,
    to: Date,
  ): Promise<void> {
    const clash = await this.leaveModel
      .findOne({
        studentId,
        status: {
          $in: [LeaveStatusEnum.PENDING, LeaveStatusEnum.APPROVED],
        },
        fromDate: { $lte: to },
        toDate: { $gte: from },
      })
      .select('fromDate toDate status')
      .lean();

    if (clash) {
      throw new ConflictException(
        `You already have a ${clash.status} leave from ${this.formatDate(
          clash.fromDate,
        )} to ${this.formatDate(clash.toDate)}. Cancel it before applying again.`,
      );
    }
  }

  // ============================================================
  // HELPERS: NOTIFICATIONS
  // ============================================================

  /**
   * Step 1 of the flow: ping the HOD(s) of the applicant's department.
   * If the department has no HOD (or the applicant *is* the HOD), fall back
   * to the admins so the request is never silently stuck.
   */
  private async notifyHodOfNewRequest(
    leave: LeaveRequestDocument,
    actor: Actor,
  ): Promise<void> {
    const recipients = await this.resolveApprovers(actor);

    if (recipients.length === 0) {
      this.logger.warn(
        `No HOD or admin found for department ${actor.department?.toString()} — leave ${leave._id} has nobody to notify`,
      );
      return;
    }

    const range = this.dateRange(leave);

    await Promise.allSettled(
      recipients.map((approver) =>
        this.notificationService
          .create({
            userId: approver._id.toString(),
            senderId: actor._id.toString(),
            senderName: this.fullName(actor),
            senderRole: actor.role,
            type: LEAVE_NOTIFICATION_KIND,
            title: 'New Leave Request',
            message: `${this.fullName(actor)} has applied for ${leave.leaveTypeName} leave (${leave.totalDays} day(s), ${range}).`,
            data: {
              notification_type: LEAVE_NOTIFICATION_TYPE,
              leaveId: leave._id.toString(),
              studentId: leave.studentId.toString(),
              leaveTypeName: leave.leaveTypeName,
              fromDate: leave.fromDate,
              toDate: leave.toDate,
              totalDays: leave.totalDays,
              status: leave.status,
            },
            classNames: [],
          })
          .catch((err) => {
            this.logger.error(`Leave request notification failed: ${err}`);
            throw err;
          }),
      ),
    );
  }

  /**
   * Step 2 of the flow: tell the student the decision.
   */
  private async notifyStudentOfDecision(
    leave: LeaveRequestDocument,
    reviewer: Actor,
  ): Promise<void> {
    const approved = leave.status === LeaveStatusEnum.APPROVED;
    const note = leave.decisionNote ? ` Reason: ${leave.decisionNote}` : '';

    await Promise.allSettled([
      this.notificationService
        .create({
          userId: leave.studentId.toString(),
          senderId: reviewer._id.toString(),
          senderName: this.fullName(reviewer),
          senderRole: reviewer.role,
          type: LEAVE_NOTIFICATION_KIND,
          title: approved ? 'Leave Approved' : 'Leave Rejected',
          message: `Your ${leave.leaveTypeName} leave for ${this.dateRange(leave)} has been ${
            approved ? 'approved' : 'rejected'
          } by ${this.fullName(reviewer)}.${note}`,
          data: {
            notification_type: LEAVE_NOTIFICATION_TYPE,
            leaveId: leave._id.toString(),
            studentId: leave.studentId.toString(),
            leaveTypeName: leave.leaveTypeName,
            fromDate: leave.fromDate,
            toDate: leave.toDate,
            totalDays: leave.totalDays,
            status: leave.status,
            decisionNote: leave.decisionNote,
          },
          classNames: [],
        })
        .catch((err) => {
          this.logger.error(`Leave decision notification failed: ${err}`);
          throw err;
        }),
    ]);
  }

  /** HODs of a department; admins when there is no HOD or the applicant is one. */
  private async resolveApprovers(actor: Actor): Promise<Actor[]> {
    const hods = actor.department
      ? await this.userModel
          .find({
            department: actor.department,
            isHod: true,
            isActive: { $ne: false },
          })
          .select('_id name lastName role isHod department')
          .lean<Actor[]>()
      : [];

    const others = hods.filter((h) => h._id.toString() !== actor._id.toString());
    if (others.length > 0) {
      return others;
    }

    // No other HOD in the department (applicant is the HOD, or dept has none)
    const admins = await this.userModel
      .find({ role: UserRoleEnum.ADMIN, isActive: { $ne: false } })
      .select('_id name lastName role isHod department')
      .lean<Actor[]>();

    return admins.filter((a) => a._id.toString() !== actor._id.toString());
  }

  // ============================================================
  // HELPERS: FORMATTING
  // ============================================================

  private async decorate(leave: LeaveRequestDocument) {
    return this.leaveModel
      .findById(leave._id)
      .populate('leaveType', 'name isActive')
      .populate('department', 'name code')
      .populate('studentId', 'name lastName specialId rollNo class image')
      .lean();
  }

  private fullName(user: { name?: string; lastName?: string }): string {
    return [user?.name, user?.lastName].filter(Boolean).join(' ').trim();
  }

  private roleLabel(actor: Actor): string {
    if (actor.role === UserRoleEnum.ADMIN) return 'Admin';
    if (actor.isHod === true) return 'Head of Department';
    if (actor.role === UserRoleEnum.PROFF) return 'Professor';
    if (actor.role === UserRoleEnum.STAFF) return 'Staff';
    if (actor.role === UserRoleEnum.STUDENT) return 'Student';
    return actor.role;
  }

  private scopeLabel(
    scope: { name: 'own' | 'department' | 'all' },
    department: { name?: string; code?: string } | null,
  ): string {
    if (scope.name === 'all') return 'All leave requests';
    if (scope.name === 'department') {
      return `Leave requests of ${
        department?.name || department?.code || 'your'
      } department`;
    }
    return 'My leave requests';
  }

  private async departmentInfo(
    department?: Types.ObjectId | null,
  ): Promise<{ _id: string; name?: string; code?: string } | null> {
    if (!department) return null;
    const dept = await this.departmentModel
      .findById(department)
      .select('name code')
      .lean<{ name?: string; code?: string }>();
    return {
      _id: department.toString(),
      name: dept?.name,
      code: dept?.code,
    };
  }

  /** "2026-10-03" for a single day, "2026-10-03 to 2026-10-04" for a range. */
  private dateRange(leave: {
    fromDate: Date | string;
    toDate: Date | string;
  }): string {
    const from = this.formatDate(leave.fromDate);
    const to = this.formatDate(leave.toDate);
    return from === to ? from : `${from} to ${to}`;
  }

  /**
   * Formats a stored date as YYYY-MM-DD using LOCAL components.
   * Dates are stored at local midnight, so `toISOString()` would shift them a
   * day backwards for any timezone ahead of UTC (e.g. PKT) and show the user
   * the wrong leave dates in notification text.
   */
  private formatDate(date: Date | string): string {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return String(date);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  private assertObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid leave id');
    }
  }
}
