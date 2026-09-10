import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Fee, FeeDocument, FeeStatusEnum } from './fee.schema';
import {
  CreateFeeDto,
  GenerateFeeDto,
  GetDepartmentStudentsFeeDto,
  GetFeeRecordsDto,
  UpdateFeeStatusDto,
} from './fee.dto';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { Department, DepartmentDocument } from 'src/department/schema/department.schema';
import { Class, ClassDocument } from 'src/class/schema/class.schema';
import { NotificationService } from 'src/notification/notification.service';

@Injectable()
export class FeeService {
  private logger = new Logger('FeeService');

  constructor(
    @InjectModel(Fee.name) private feeModel: Model<FeeDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Department.name)
    private departmentModel: Model<DepartmentDocument>,
    @InjectModel(Class.name) private classModel: Model<ClassDocument>,
    private notificationService: NotificationService,
  ) {}

  async createFee(dto: CreateFeeDto): Promise<FeeDocument> {
    const fee = await this.feeModel.create({
      studentId: new Types.ObjectId(dto.studentId),
      classId: dto.classId ? new Types.ObjectId(dto.classId) : undefined,
      departmentId: dto.departmentId
        ? new Types.ObjectId(dto.departmentId)
        : undefined,
      className: dto.className || '',
      month: dto.month,
      year: dto.year,
      amount: dto.amount,
      status: dto.status || FeeStatusEnum.PENDING,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      paidDate: dto.paidDate ? new Date(dto.paidDate) : undefined,
      description: dto.description || '',
      category: dto.category || '',
      semester: dto.semester || '',
      class: dto.class || '',
      customFields: dto.customFields || [],
    });
    return fee.populate('studentId classId departmentId');
  }

  async getStudentFeeSummary(studentId: string, year?: string) {
    this.validateObjectId(studentId, 'Invalid student ID');

    const filter: any = { studentId: new Types.ObjectId(studentId) };
    if (year) filter.year = parseInt(year, 10);

    const fees = await this.feeModel
      .find(filter)
      .sort({ year: -1, month: -1 })
      .lean();

    if (fees.length === 0) {
      return {
        totalRecords: 0,
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        pending: [],
        paid: [],
        waived: [],
      };
    }

    const totalRecords = fees.length;
    const totalAmount = fees.reduce((s, f) => s + f.amount, 0);
    const paidAmount = fees
      .filter(
        (f) =>
          f.status === FeeStatusEnum.PAID || f.status === FeeStatusEnum.WAIVED,
      )
      .reduce((s, f) => s + f.amount, 0);
    const pendingAmount = fees
      .filter((f) => f.status === FeeStatusEnum.PENDING)
      .reduce((s, f) => s + f.amount, 0);

    const serialize = (fees: any[]) =>
      fees.map((f) => ({
        _id: f._id.toString(),
        studentId: f.studentId.toString(),
        classId: f.classId ? f.classId.toString() : '',
        className: f.className || '',
        month: f.month,
        year: f.year,
        amount: f.amount,
        status: f.status,
        dueDate: f.dueDate ? f.dueDate.toISOString() : undefined,
        paidDate: f.paidDate ? f.paidDate.toISOString() : undefined,
        description: f.description || '',
        category: f.category || '',
        semester: f.semester || '',
        class: f.class || '',
        createdAt: f.createdAt ? f.createdAt.toISOString() : undefined,
        updatedAt: f.updatedAt ? f.updatedAt.toISOString() : undefined,
        customFields: f.customFields || [],
      }));

    return {
      totalRecords,
      totalAmount,
      paidAmount,
      pendingAmount,
      pending: serialize(fees.filter((f) => f.status === FeeStatusEnum.PENDING)),
      paid: serialize(
        fees.filter(
          (f) =>
            f.status === FeeStatusEnum.PAID || f.status === FeeStatusEnum.WAIVED,
        ),
      ),
      waived: serialize(fees.filter((f) => f.status === FeeStatusEnum.WAIVED)),
    };
  }

  async getDepartmentStudentsFee(query: GetDepartmentStudentsFeeDto): Promise<any> {
    const { departmentId, search } = query;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    this.validateObjectId(departmentId, 'Invalid department ID');

    const department = await this.departmentModel
      .findOne({ _id: new Types.ObjectId(departmentId) })
      .select('name code')
      .lean();

    const searchFilter: any = {};
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      searchFilter.$or = [
        { name: regex },
        { lastName: regex },
        { specialId: regex },
        { cnic: regex },
        { phone: regex },
        { email: regex },
      ];
    }

    const studentFilter: any = {
      role: 'student',
      department: new Types.ObjectId(departmentId),
      ...searchFilter,
    };

    const [totalStudents, allStudents] = await Promise.all([
      this.userModel.countDocuments(studentFilter),
      this.userModel
        .find(studentFilter)
        .select('_id name lastName specialId email phone rollNo department')
        .sort({ rollNo: 1 })
        .lean(),
    ]);

    const studentIds = allStudents.map((s) => s._id);

    const fees = await this.feeModel
      .find({ studentId: { $in: studentIds } })
      .populate('studentId', 'name lastName specialId email phone rollNo')
      .populate('classId', 'className')
      .lean();

    const feesByStudent = new Map<string, any[]>();
    for (const fee of fees) {
      const key = fee.studentId._id.toString();
      if (!feesByStudent.has(key)) feesByStudent.set(key, []);
      feesByStudent.get(key)!.push(fee);
    }

    const serializeRecord = (f: any) => ({
      _id: f._id.toString(),
      studentId: {
        _id: (f.studentId?._id || f.studentId || '').toString(),
        name: f.studentId?.name || '',
        lastName: f.studentId?.lastName || '',
      },
      classId: f.classId
        ? { _id: f.classId._id.toString(), className: f.classId.className || '' }
        : '',
      className: f.className || (f.classId?.className as string) || '',
      month: f.month,
      year: f.year,
      amount: f.amount,
      status: f.status,
      dueDate: f.dueDate ? f.dueDate.toISOString() : undefined,
      paidDate: f.paidDate ? f.paidDate.toISOString() : undefined,
      description: f.description || '',
      category: f.category || '',
      semester: f.semester || '',
      class: f.class || '',
      createdAt: f.createdAt ? f.createdAt.toISOString() : undefined,
      updatedAt: f.updatedAt ? f.updatedAt.toISOString() : undefined,
      customFields: f.customFields || [],
    });

    const students = allStudents.map((s) => {
      const studentFees = feesByStudent.get(s._id.toString()) || [];
      const totalAmount = studentFees.reduce((sum, f) => sum + f.amount, 0);
      const paidAmount = studentFees
        .filter(
          (f) =>
            f.status === FeeStatusEnum.PAID || f.status === FeeStatusEnum.WAIVED,
        )
        .reduce((sum, f) => sum + f.amount, 0);
      const pendingAmount = studentFees
        .filter((f) => f.status === FeeStatusEnum.PENDING)
        .reduce((sum, f) => sum + f.amount, 0);

      return {
        student: {
          _id: s._id.toString(),
          name: s.name || '',
          lastName: s.lastName || '',
          specialId: s.specialId || '',
          email: s.email || '',
          phone: s.phone || '',
          rollNo: s.rollNo ?? null,
        },
        summary: {
          totalRecords: studentFees.length,
          totalAmount,
          paidAmount,
          pendingAmount,
          paidCount: studentFees.filter(
            (f) =>
              f.status === FeeStatusEnum.PAID ||
              f.status === FeeStatusEnum.WAIVED,
          ).length,
          pendingCount: studentFees.filter(
            (f) => f.status === FeeStatusEnum.PENDING,
          ).length,
          waivedCount: studentFees.filter(
            (f) => f.status === FeeStatusEnum.WAIVED,
          ).length,
        },
        feeRecords: studentFees.map(serializeRecord),
      };
    });

    const startIndex = (page - 1) * limit;
    const totalPages = Math.ceil(totalStudents / limit);
    const paginated = students.slice(startIndex, startIndex + limit);

    const deptSummary = {
      totalStudents,
      totalFeeRecords: fees.length,
      totalAmount: fees.reduce((s, f) => s + f.amount, 0),
      totalPaid: fees
        .filter(
          (f) =>
            f.status === FeeStatusEnum.PAID || f.status === FeeStatusEnum.WAIVED,
        )
        .reduce((s, f) => s + f.amount, 0),
      totalPending: fees
        .filter((f) => f.status === FeeStatusEnum.PENDING)
        .reduce((s, f) => s + f.amount, 0),
    };

    return {
      department: department?.name || 'Department',
      summary: deptSummary,
      students: paginated,
      pagination: {
        total: totalStudents,
        count: paginated.length,
        page: Number(page),
        limit: Number(limit),
        totalPages,
      },
    };
  }

  async generateMonthlyFees(departmentId: string, month: string, year: number): Promise<{ created: number }> {
    this.validateObjectId(departmentId, 'Invalid department ID');

    const students = await this.userModel
      .find({ role: 'student', department: new Types.ObjectId(departmentId) })
      .select('_id department')
      .lean();

    let created = 0;
    for (const student of students) {
      const existing = await this.feeModel.exists({
        studentId: student._id,
        month,
        year,
      });
      if (existing) continue;

      await this.feeModel.create({
        studentId: student._id,
        departmentId: new Types.ObjectId(departmentId),
        month,
        year,
        amount: 15000,
        status: FeeStatusEnum.PENDING,
        description: `${month} Tuition Fee`,
        category: 'tuition',
        semester: '',
        class: '',
        customFields: [],
      });
      created++;
    }
    return { created };
  }

  // ============================================================
  // ADMIN PORTAL: BULK FEE GENERATION
  // POST /fee/generate
  // ============================================================

  /**
   * Generate fee records for multiple students at once.
   * Skips students who already have a fee for the same month+year.
   * After creation, sends a notification to each student.
   */
  async generateFee(dto: GenerateFeeDto, actor?: { _id: string; name: string; role: string }) {
    const { studentIds, month, year, amount } = dto;

    // Resolve class name if only classId provided
    let className = dto.className || '';
    if (dto.classId && !className) {
      const cls = await this.classModel.findById(dto.classId).select('className').lean();
      className = cls?.className || '';
    }

    const students = await this.userModel
      .find({ _id: { $in: studentIds.map((id) => new Types.ObjectId(id)) } })
      .select('_id role department specialId name')
      .lean<{ _id: Types.ObjectId; role: string; department?: Types.ObjectId; specialId?: string; name?: string }[]>();

    const studentMap = new Map(students.map((s) => [s._id.toString(), s]));

    const createdRecords: FeeDocument[] = [];
    let skipped = 0;

    for (const studentId of studentIds) {
      if (!studentMap.has(studentId)) continue;

      const existing = await this.feeModel.exists({ studentId: new Types.ObjectId(studentId), month, year });
      if (existing) {
        skipped++;
        continue;
      }

      const student = studentMap.get(studentId)!;
      const fee = await this.feeModel.create({
        studentId: new Types.ObjectId(studentId),
        classId: dto.classId ? new Types.ObjectId(dto.classId) : undefined,
        departmentId: student.department ? new Types.ObjectId(student.department) : undefined,
        className,
        month,
        year,
        amount,
        status: FeeStatusEnum.PENDING,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        description: dto.description || `${month} Fee`,
        category: dto.category || '',
        semester: dto.semester || '',
        class: dto.class || '',
        customFields: dto.customFields || [],
      });
      createdRecords.push(fee);
    }

    // Send notifications to students who got a fee created
    if (createdRecords.length > 0) {
      const feeIds = createdRecords.map((f) => f._id.toString());
      this.notificationService
        .createBulk({
          userIds: createdRecords.map((f) => f.studentId.toString()),
          senderId: actor?._id || '',
          senderName: actor?.name || 'Admin',
          senderRole: actor?.role || 'admin',
          type: 'class',
          title: 'Fee Generated',
          message: `${month} ${year} fee of PKR ${amount} has been generated. Due date: ${dto.dueDate || 'N/A'}`,
          data: {
            type: 'fee',
            feeIds,
            month,
            year: String(year),
            amount: String(amount),
          },
          classNames: className ? [className] : [],
        })
        .then(() => this.logger.log(`🔔 Fee notifications sent to ${createdRecords.length} students`))
        .catch((err) => this.logger.error(`Fee notification failed: ${err}`));
    }

    return {
      message: `Fee generated for ${createdRecords.length} student(s)`,
      created: createdRecords.length,
      skipped,
      feeIds: createdRecords.map((f) => f._id.toString()),
    };
  }

  // ============================================================
  // ADMIN PORTAL: FILTERED RECORDS LIST
  // GET /fee/records
  // ============================================================

  async getFeeRecords(query: GetFeeRecordsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 20);

    const filter: any = {};
    if (query.studentId) filter.studentId = new Types.ObjectId(query.studentId);
    if (query.classId) filter.classId = new Types.ObjectId(query.classId);
    if (query.month) filter.month = query.month.toLowerCase();
    if (query.year) filter.year = Number(query.year);
    if (query.status) filter.status = query.status.toLowerCase();
    if (query.category) filter.category = query.category.toLowerCase();
    if (query.semester) filter.semester = query.semester;

    const [total, records] = await Promise.all([
      this.feeModel.countDocuments(filter),
      this.feeModel
        .find(filter)
        .populate('studentId', 'name lastName specialId email phone rollNo')
        .populate('classId', 'className')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      records,
      pagination: {
        total,
        count: records.length,
        page,
        limit,
        totalPages,
      },
    };
  }

  // ============================================================
  // ADMIN PORTAL: SINGLE RECORD
  // GET /fee/records/:id
  // ============================================================

  async getFeeRecordById(id: string) {
    this.validateObjectId(id, 'Invalid fee record ID');
    const fee = await this.feeModel
      .findById(id)
      .populate('studentId', 'name lastName specialId email phone rollNo')
      .populate('classId', 'className')
      .lean();
    if (!fee) throw new NotFoundException('Fee record not found');
    return fee;
  }

  // ============================================================
  // ADMIN PORTAL: UPDATE STATUS
  // PATCH /fee/records/:id/status
  // ============================================================

  async updateFeeStatus(id: string, dto: UpdateFeeStatusDto, actor?: { _id: string; name: string; role: string }) {
    this.validateObjectId(id, 'Invalid fee record ID');

    const fee = await this.feeModel.findById(id);
    if (!fee) throw new NotFoundException('Fee record not found');

    const prevStatus = fee.status;
    fee.status = dto.status as FeeStatusEnum;
    if (dto.status === FeeStatusEnum.PAID) {
      fee.paidDate = dto.paidDate ? new Date(dto.paidDate) : new Date();
    } else {
      fee.paidDate = undefined;
    }
    await fee.save();

    // Notify student when a fee is newly marked as paid
    if (prevStatus !== FeeStatusEnum.PAID && fee.status === FeeStatusEnum.PAID) {
      this.notificationService
        .create({
          userId: fee.studentId.toString(),
          senderId: actor?._id || '',
          senderName: actor?.name || 'Admin',
          senderRole: actor?.role || 'admin',
          type: 'class',
          title: 'Fee Paid',
          message: `Your ${fee.month} ${fee.year} fee of PKR ${fee.amount} has been marked as paid.`,
          data: { type: 'fee', feeId: fee._id.toString(), amount: String(fee.amount) },
          classNames: fee.className ? [fee.className] : [],
        })
        .catch((err) => this.logger.error(`Fee payment notification failed: ${err}`));
    }

    return fee;
  }

  // ============================================================
  // ADMIN PORTAL: DELETE RECORD
  // DELETE /fee/records/:id
  // ============================================================

  async deleteFeeRecord(id: string): Promise<{ message: string }> {
    this.validateObjectId(id, 'Invalid fee record ID');
    const result = await this.feeModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('Fee record not found');
    return { message: 'Fee record deleted' };
  }

  // ============================================================
  // ADMIN PORTAL: APPROVE / UNAPPROVE
  // PATCH /fee/records/:id/approve | /unapprove
  // ============================================================

  async approveFee(id: string, actor?: { _id: string; name: string; role: string }) {
    return this.updateFeeStatus(
      id,
      { status: 'paid', paidDate: new Date().toISOString() },
      actor,
    );
  }

  async unapproveFee(id: string) {
    return this.updateFeeStatus(id, { status: 'pending' });
  }

  private validateObjectId(id: string, message: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException(message);
  }
}