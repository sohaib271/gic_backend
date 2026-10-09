import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Department, DepartmentDocument } from './schema/department.schema';
import { CreateDepartmentDto } from './dto/CreateDepartment.dto';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { UserRoleEnum } from 'src/user/enum/UserRole.enum';
import { Class, ClassDocument } from 'src/class/schema/class.schema';
import {
  Attendance,
  AttendenceDocument,
} from 'src/attendence/schema/attendence.schema';
import { Fee, FeeDocument } from 'src/fee/fee.schema';
import {
  LeaveRequest,
  LeaveRequestDocument,
} from 'src/leave/schema/leave-request.schema';
import { Remark, RemarkDocument } from 'src/remarks/schema/remark.schema';
import {
  TeacherAttendance,
  TeacherAttendanceDocument,
} from 'src/teacher/schema/teacherAttendance';
import {
  MidtermSchedule,
  MidtermScheduleDocument,
} from 'src/midterm/schema/midterm-schedule.schema';

@Injectable()
export class DepartmentService {
  constructor(
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Class.name)
    private readonly classModel: Model<ClassDocument>,
    @InjectModel(Attendance.name)
    private readonly attendanceModel: Model<AttendenceDocument>,
    @InjectModel(Fee.name)
    private readonly feeModel: Model<FeeDocument>,
    @InjectModel(LeaveRequest.name)
    private readonly leaveModel: Model<LeaveRequestDocument>,
    @InjectModel(Remark.name)
    private readonly remarkModel: Model<RemarkDocument>,
    @InjectModel(TeacherAttendance.name)
    private readonly teacherAttendanceModel: Model<TeacherAttendanceDocument>,
    @InjectModel(MidtermSchedule.name)
    private readonly midtermModel: Model<MidtermScheduleDocument>,
  ) {}

  /* ======================
     CREATE DEPARTMENT
  ======================= */
  async createDepartment(dto: CreateDepartmentDto) {
    // Check if department name already exists
    const existingDept = await this.departmentModel.exists({
      name: dto.name,
    });

    if (existingDept) {
      throw new ConflictException('Department name already exists');
    }

    const department = new this.departmentModel(dto);
    await department.save();

    return {
      message: 'Department created successfully',
      department,
    };
  }

  /* ======================
     GET ALL DEPARTMENTS
  ======================= */
  async getAllDepartments() {
    const departments = await this.departmentModel.find().lean();
    return departments;
  }

  /* ======================
     GET DEPARTMENT BY ID
  ======================= */
  async getDepartmentById(id: string) {
    const department = await this.departmentModel.findById(id).lean();

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  /* ======================
     UPDATE DEPARTMENT
  ======================= */
  async updateDepartment(id: string, updateData: Partial<CreateDepartmentDto>) {
    // Check if updating name to existing name
    if (updateData.name) {
      const existingDept = await this.departmentModel.exists({
        name: updateData.name,
        _id: { $ne: id },
      });

      if (existingDept) {
        throw new ConflictException('Department name already exists');
      }
    }

    const department = await this.departmentModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true },
    );

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return {
      message: 'Department updated successfully',
      department,
    };
  }

  /* ======================
     DELETE DEPARTMENT
  ======================= */
  async deleteDepartment(id: string) {
    const department = await this.departmentModel.findByIdAndDelete(id);

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return {
      message: 'Department deleted successfully',
      deletedDepartment: department,
    };
  }

  /* ============================================================
     HOD DEPARTMENT DASHBOARD
     GET /departments/dashboard
     ============================================================
     Aggregated, department-scoped data for the HOD's home screen:
     students, staff, classes, attendance, teacher attendance, fees,
     leaves, remarks and midterm schedule.

     Scope rules:
       - HOD (isHod === true)  -> their own department, taken from the JWT
       - admin                 -> their own department, taken from the JWT
       - everyone else         -> 403
       - The department is NEVER taken from the client; it is always resolved
         from the logged-in user's record on the backend.
  ============================================================ */
  async getHodDashboard(query: any, req: any) {
    const actor = await this.userModel
      .findById(req?.user?.sub)
      .select('_id name lastName role isHod department isPrincipal')
      .lean<any>();

    if (!actor) {
      throw new ForbiddenException('User not found');
    }

    const isAdmin = actor.role === UserRoleEnum.ADMIN;
    if (actor.isHod !== true && !isAdmin) {
      throw new ForbiddenException(
        'Only an HOD or an admin can open the department dashboard',
      );
    }

    // Department always comes from the logged-in user, never from the request.
    if (!actor.department) {
      throw new ForbiddenException(
        'Your profile has no department assigned. Contact the admin.',
      );
    }

    const departmentId = actor.department.toString();
    if (!Types.ObjectId.isValid(departmentId)) {
      throw new BadRequestException('Invalid department on your profile');
    }

    const deptObjId = new Types.ObjectId(departmentId);
    // Legacy rows may store the department as a plain string, so match both.
    const deptMatch = { $in: [deptObjId, departmentId] } as any;

    const { start, end } = this.resolveRange(query?.from, query?.to);
    const year = Number(query?.year) || new Date().getFullYear();

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const sevenStart = new Date(dayStart);
    sevenStart.setDate(sevenStart.getDate() - 6);

    const [
      department,
      classes,
      studentAggRows,
      teacherAggRows,
      studentIds,
      feeAgg,
      leaveAgg,
      leaveRecent,
    ] = await Promise.all([
      this.departmentModel.findById(deptObjId).lean(),
      this.classModel
        .find({ departmentId: deptObjId })
        .select('_id className classStudents subjects assignes class category session')
        .sort({ className: 1 })
        .lean(),
      this.userModel.aggregate([
        { $match: { role: 'student', department: deptMatch } },
        {
          $facet: {
            total: [{ $count: 'n' }],
            active: [{ $match: { isActive: { $ne: false } } }, { $count: 'n' }],
            struckOff: [{ $match: { struckOff: true } }, { $count: 'n' }],
            onLeave: [{ $match: { is_leave_approved: true } }, { $count: 'n' }],
            appliedLeave: [
              { $match: { is_apply_leave: true } },
              { $count: 'n' },
            ],
            pendingApproval: [
              { $match: { approvalStatus: 'pending' } },
              { $count: 'n' },
            ],
            byClass: [
              { $group: { _id: '$class', count: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ],
            byCategory: [
              { $group: { _id: '$category', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ],
            bySession: [
              { $group: { _id: '$session', count: { $sum: 1 } } },
              { $sort: { _id: -1 } },
            ],
            byGender: [{ $group: { _id: '$gender', count: { $sum: 1 } } }],
          },
        },
      ]),
      this.userModel.aggregate([
        {
          $match: {
            role: { $in: [UserRoleEnum.PROFF, UserRoleEnum.STAFF] },
            department: deptMatch,
          },
        },
        {
          $facet: {
            total: [{ $count: 'n' }],
            proff: [
              { $match: { role: UserRoleEnum.PROFF } },
              { $count: 'n' },
            ],
            staff: [
              { $match: { role: UserRoleEnum.STAFF } },
              { $count: 'n' },
            ],
            hod: [{ $match: { isHod: true } }, { $count: 'n' }],
            principal: [{ $match: { isPrincipal: true } }, { $count: 'n' }],
            active: [{ $match: { isActive: { $ne: false } } }, { $count: 'n' }],
            ids: [{ $project: { _id: 1 } }],
          },
        },
      ]),
      this.userModel.distinct('_id', {
        role: 'student',
        department: deptMatch,
      }),
      this.feeModel.aggregate([
        { $match: { departmentId: deptMatch, year } },
        {
          $group: {
            _id: '$status',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
      this.leaveModel.aggregate([
        { $match: { department: deptMatch } },
        {
          $facet: {
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
            byType: [
              { $group: { _id: '$leaveTypeName', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ],
            avgDays: [{ $group: { _id: null, avg: { $avg: '$totalDays' } } }],
          },
        },
      ]),
      this.leaveModel
        .find({ department: deptMatch })
        .select(
          'studentName studentId leaveTypeName fromDate toDate totalDays status createdAt',
        )
        .populate('studentId', 'name lastName image')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const studentAgg = studentAggRows?.[0] || {};
    const teacherAgg = teacherAggRows?.[0] || {};
    const teacherIds: Types.ObjectId[] = (teacherAgg.ids || []).map(
      (t: any) => t._id,
    );
    const classIds: Types.ObjectId[] = classes.map((c: any) => c._id);

    /* ---------- Attendance ---------- */
    const [attTodayRows, attTrendRows, attByClassRows, topAbsent] =
      await Promise.all([
        classIds.length
          ? this.attendanceModel.aggregate([
              {
                $match: {
                  classId: { $in: classIds },
                  date: { $gte: dayStart, $lt: dayEnd },
                },
              },
              { $group: { _id: '$attendenceStatus', count: { $sum: 1 } } },
            ])
          : Promise.resolve([]),
        classIds.length
          ? this.attendanceModel.aggregate([
              {
                $match: {
                  classId: { $in: classIds },
                  date: { $gte: sevenStart, $lt: dayEnd },
                },
              },
              {
                $group: {
                  _id: {
                    day: {
                      $dateToString: { format: '%Y-%m-%d', date: '$date' },
                    },
                    status: '$attendenceStatus',
                  },
                  count: { $sum: 1 },
                },
              },
            ])
          : Promise.resolve([]),
        classIds.length
          ? this.attendanceModel.aggregate([
              {
                $match: {
                  classId: { $in: classIds },
                  date: { $gte: start, $lte: end },
                },
              },
              {
                $group: {
                  _id: {
                    classId: '$classId',
                    status: '$attendenceStatus',
                  },
                  count: { $sum: 1 },
                },
              },
            ])
          : Promise.resolve([]),
        classIds.length
          ? this.attendanceModel.aggregate([
              {
                $match: {
                  classId: { $in: classIds },
                  date: { $gte: start, $lte: end },
                  attendenceStatus: 'A',
                },
              },
              { $group: { _id: '$studentId', absentCount: { $sum: 1 } } },
              { $sort: { absentCount: -1 } },
              { $limit: 5 },
              {
                $lookup: {
                  from: 'users',
                  localField: '_id',
                  foreignField: '_id',
                  as: 'student',
                },
              },
              { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
              {
                $project: {
                  studentId: '$_id',
                  name: {
                    $trim: {
                      input: {
                        $concat: [
                          { $ifNull: ['$student.name', ''] },
                          ' ',
                          { $ifNull: ['$student.lastName', ''] },
                        ],
                      },
                    },
                  },
                  specialId: { $ifNull: ['$student.specialId', ''] },
                  image: { $ifNull: ['$student.image', ''] },
                  absentCount: 1,
                },
              },
            ])
          : Promise.resolve([]),
      ]);

    /* ---------- Teacher attendance ---------- */
    const [taTodayRows, taPresentIds, taTrendRows] = await Promise.all([
      teacherIds.length
        ? this.teacherAttendanceModel.aggregate([
            {
              $match: {
                teacherId: { $in: teacherIds },
                currentDate: { $gte: dayStart, $lt: dayEnd },
              },
            },
            { $group: { _id: '$type', count: { $sum: 1 } } },
          ])
        : Promise.resolve([]),
      teacherIds.length
        ? this.teacherAttendanceModel.distinct('teacherId', {
            teacherId: { $in: teacherIds },
            currentDate: { $gte: dayStart, $lt: dayEnd },
            type: 'check-in',
          })
        : Promise.resolve([]),
      teacherIds.length
        ? this.teacherAttendanceModel.aggregate([
            {
              $match: {
                teacherId: { $in: teacherIds },
                currentDate: { $gte: sevenStart, $lt: dayEnd },
              },
            },
            {
              $group: {
                _id: {
                  day: {
                    $dateToString: { format: '%Y-%m-%d', date: '$currentDate' },
                  },
                  type: '$type',
                },
                count: { $sum: 1 },
              },
            },
          ])
        : Promise.resolve([]),
    ]);

    /* ---------- Remarks ---------- */
    const remarkScope =
      teacherIds.length || studentIds.length || classIds.length;
    const remarkMatch: any = {
      $or: [
        { authorId: { $in: teacherIds } },
        ...(studentIds.length
          ? [{ entityType: 'student', entityId: { $in: studentIds } }]
          : []),
        ...(classIds.length
          ? [{ entityType: 'class', entityId: { $in: classIds } }]
          : []),
      ],
    };
    const [remarkTotal, remarkRecent] = await Promise.all([
      remarkScope
        ? this.remarkModel.countDocuments(remarkMatch)
        : Promise.resolve(0),
      remarkScope
        ? this.remarkModel
            .find(remarkMatch)
            .select('authorName authorRole text createdAt entityType')
            .populate('authorId', 'name lastName image')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean()
        : Promise.resolve([]),
    ]);

    /* ---------- Midterm ---------- */
    const midterms = classIds.length
      ? await this.midtermModel
          .find({ classId: { $in: classIds } })
          .select('classId papers publishedAt')
          .lean()
      : [];

    /* ======================
       SHAPE THE RESPONSE
    ======================= */

    // Students
    const students = {
      total: this.count(studentAgg.total),
      active: this.count(studentAgg.active),
      struckOff: this.count(studentAgg.struckOff),
      onLeave: this.count(studentAgg.onLeave),
      appliedLeave: this.count(studentAgg.appliedLeave),
      pendingApproval: this.count(studentAgg.pendingApproval),
      byClass: (studentAgg.byClass || [])
        .filter((r: any) => r._id)
        .map((r: any) => ({ class: r._id, count: r.count })),
      byCategory: (studentAgg.byCategory || [])
        .filter((r: any) => r._id)
        .map((r: any) => ({ category: r._id, count: r.count })),
      bySession: (studentAgg.bySession || [])
        .filter((r: any) => r._id)
        .map((r: any) => ({ session: r._id, count: r.count })),
      byGender: Object.fromEntries(
        (studentAgg.byGender || [])
          .filter((r: any) => r._id)
          .map((r: any) => [r._id, r.count]),
      ),
    };

    // Teachers
    const teachers = {
      total: this.count(teacherAgg.total),
      proff: this.count(teacherAgg.proff),
      staff: this.count(teacherAgg.staff),
      hod: this.count(teacherAgg.hod),
      principal: this.count(teacherAgg.principal),
      active: this.count(teacherAgg.active),
    };

    // Attendance — today
    const todayPresent = this.statusCount(attTodayRows, 'P');
    const todayAbsent = this.statusCount(attTodayRows, 'A');
    const todayLeave = this.statusCount(attTodayRows, 'L');
    const todayTotal = todayPresent + todayAbsent + todayLeave;

    // Attendance — 7 day trend
    const attTrendMap = new Map<string, { P: number; A: number; L: number }>();
    for (const row of attTrendRows) {
      const day = row._id.day;
      if (!attTrendMap.has(day)) attTrendMap.set(day, { P: 0, A: 0, L: 0 });
      const entry = attTrendMap.get(day)!;
      if (row._id.status === 'P') entry.P = row.count;
      else if (row._id.status === 'A') entry.A = row.count;
      else if (row._id.status === 'L') entry.L = row.count;
    }
    const attendanceTrend = [...attTrendMap.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, v]) => ({
        date,
        present: v.P,
        absent: v.A,
        leave: v.L,
        percent: this.pct(v.P, v.P + v.A + v.L),
      }));

    // Attendance — class wise (for the selected range)
    const classNameById = new Map(
      classes.map((c: any) => [c._id.toString(), c.className]),
    );
    const attClassMap = new Map<string, { P: number; A: number; L: number }>();
    for (const row of attByClassRows) {
      const cid = row._id.classId?.toString();
      if (!cid) continue;
      if (!attClassMap.has(cid)) attClassMap.set(cid, { P: 0, A: 0, L: 0 });
      const entry = attClassMap.get(cid)!;
      if (row._id.status === 'P') entry.P = row.count;
      else if (row._id.status === 'A') entry.A = row.count;
      else if (row._id.status === 'L') entry.L = row.count;
    }
    const attendanceByClass = [...attClassMap.entries()].map(([cid, v]) => ({
      classId: cid,
      className: classNameById.get(cid) || '',
      present: v.P,
      absent: v.A,
      leave: v.L,
      percent: this.pct(v.P, v.P + v.A + v.L),
    }));

    // Teacher attendance
    const teacherToday = {
      checkedIn: taPresentIds.length,
      checkedOut: this.statusCount(taTodayRows, 'check-out'),
      absent: Math.max(0, teachers.total - taPresentIds.length),
    };
    const taTrendMap = new Map<string, { in: number; out: number }>();
    for (const row of taTrendRows) {
      const day = row._id.day;
      if (!taTrendMap.has(day)) taTrendMap.set(day, { in: 0, out: 0 });
      const entry = taTrendMap.get(day)!;
      if (row._id.type === 'check-in') entry.in = row.count;
      else entry.out = row.count;
    }
    const teacherAttendanceTrend = [...taTrendMap.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, v]) => ({
        date,
        checkedIn: v.in,
        checkedOut: v.out,
      }));

    // Fees
    const fee = {
      year,
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      waivedAmount: 0,
      totalRecords: 0,
      paidCount: 0,
      pendingCount: 0,
      waivedCount: 0,
      collectionPercent: 0,
    };
    for (const row of feeAgg) {
      fee.totalAmount += row.total || 0;
      fee.totalRecords += row.count || 0;
      if (row._id === 'paid') {
        fee.paidAmount = row.total || 0;
        fee.paidCount = row.count || 0;
      } else if (row._id === 'pending') {
        fee.pendingAmount = row.total || 0;
        fee.pendingCount = row.count || 0;
      } else if (row._id === 'waived') {
        fee.waivedAmount = row.total || 0;
        fee.waivedCount = row.count || 0;
      }
    }
    fee.collectionPercent = this.pct(fee.paidAmount, fee.totalAmount);

    // Leaves
    const leaveFacet = leaveAgg?.[0] || {};
    const leaveStatus: Record<string, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
    };
    for (const row of leaveFacet.byStatus || []) {
      if (row._id in leaveStatus) leaveStatus[row._id] = row.count;
    }
    const leave = {
      ...leaveStatus,
      total: Object.values(leaveStatus).reduce((a, b) => a + b, 0),
      avgDays: Math.round((leaveFacet.avgDays?.[0]?.avg || 0) * 10) / 10,
      byType: (leaveFacet.byType || []).map((r: any) => ({
        type: r._id || 'Unknown',
        count: r.count,
      })),
      recent: leaveRecent.map((l: any) => ({
        id: l._id,
        studentId: l.studentId?._id || l.studentId || null,
        studentName:
          l.studentName ||
          (l.studentId
            ? `${l.studentId.name || ''} ${l.studentId.lastName || ''}`.trim()
            : ''),
        studentImage: l.studentId?.image || '',
        leaveTypeName: l.leaveTypeName,
        fromDate: l.fromDate,
        toDate: l.toDate,
        totalDays: l.totalDays,
        status: l.status,
        createdAt: l.createdAt,
      })),
    };

    // Remarks
    const remarks = {
      total: remarkTotal,
      recent: remarkRecent.map((r: any) => ({
        id: r._id,
        authorName:
          r.authorName ||
          (r.authorId
            ? `${r.authorId.name || ''} ${r.authorId.lastName || ''}`.trim()
            : ''),
        authorRole: r.authorRole,
        authorImage: r.authorId?.image || '',
        text: r.text,
        entityType: r.entityType,
        createdAt: r.createdAt,
      })),
    };

    // Midterm
    const todayStr = `${now.getFullYear()}-${String(
      now.getMonth() + 1,
    ).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let publishedClasses = 0;
    let upcomingPapers = 0;
    for (const m of midterms) {
      if (m.papers?.length) publishedClasses++;
      for (const p of m.papers || []) {
        if (String((p as any).date) >= todayStr) upcomingPapers++;
      }
    }
    const midterm = {
      totalClasses: classes.length,
      publishedClasses,
      upcomingPapers,
    };

    // Summary cards
    const summary = {
      totalStudents: students.total,
      totalTeachers: teachers.total,
      totalClasses: classes.length,
      todayPresent,
      todayAbsent,
      todayLeave,
      attendancePercent: this.pct(todayPresent, todayTotal),
      pendingLeaves: leaveStatus.pending,
      approvedLeaves: leaveStatus.approved,
      pendingFees: fee.pendingCount,
      collectionPercent: fee.collectionPercent,
    };

    return {
      department: {
        _id: department._id,
        name: department.name,
        code: department.code,
        category: department.category,
      },
      range: { from: start, to: end },
      summary,
      students,
      teachers,
      classes: classes.map((c: any) => ({
        _id: c._id,
        className: c.className,
        class: c.class,
        category: c.category,
        session: c.session,
        students: c.classStudents?.length || 0,
        teachers: c.assignes?.length || 0,
        subjects: c.subjects?.length || 0,
      })),
      attendance: {
        today: {
          present: todayPresent,
          absent: todayAbsent,
          leave: todayLeave,
          total: todayTotal,
          percent: this.pct(todayPresent, todayTotal),
        },
        trend: attendanceTrend,
        byClass: attendanceByClass,
        topAbsentStudents: topAbsent.map((s: any) => ({
          studentId: s.studentId,
          name: s.name,
          specialId: s.specialId,
          image: s.image,
          absentCount: s.absentCount,
        })),
      },
      teacherAttendance: {
        today: teacherToday,
        trend: teacherAttendanceTrend,
      },
      fee,
      leave,
      remarks,
      midterm,
    };
  }

  /* ======================
     DASHBOARD HELPERS
  ======================= */

  private resolveRange(from?: string, to?: string) {
    const now = new Date();
    const start = from
      ? new Date(from)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = to ? new Date(to) : now;
    end.setHours(23, 59, 59, 999);

    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException('Invalid from date');
    }
    if (Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid to date');
    }

    return { start, end };
  }

  /** Count rows produced by a `$count` stage. */
  private count(rows: any[]): number {
    return (rows && rows[0] && (rows[0].n ?? rows[0].count)) || 0;
  }

  /** Count rows produced by a `$group` on a known key. */
  private statusCount(rows: any[], key: string): number {
    return rows?.find((r) => r._id === key)?.count || 0;
  }

  /** Percentage with one decimal place; 0 when there is nothing to divide. */
  private pct(part: number, total: number): number {
    if (!total) return 0;
    return Math.round((part / total) * 1000) / 10;
  }
}
