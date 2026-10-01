import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schema/user.schema';
import { Department, DepartmentDocument } from '../department/schema/department.schema';
import {
  RegistrationToken,
  RegistrationTokenDocument,
} from './schema/registration-token.schema';
import {
  CreateRegistrationTokenDto,
  RegisterStudentDto,
  ReviewRegistrationDto,
} from './dto/create-user.dto/register-student.dto';

@Injectable()
export class RegistrationService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    @InjectModel(RegistrationToken.name)
    private readonly tokenModel: Model<RegistrationTokenDocument>,
  ) {}

  // ── Token minting (HOD/admin only, guarded in the controller) ──
  async createToken(
    dto: CreateRegistrationTokenDto,
    createdBy: string,
    creatorDepartment?: string,
  ) {
    const department = await this.departmentModel
      .findById(dto.department)
      .lean()
      .exec();
    if (!department) throw new NotFoundException('Department not found');

    // The category must belong to the department, otherwise a link could
    // offer "intermediate" inside a bs_adp department.
    if (dto.category) {
      const deptCategory = department.category;
      const isIntermediate = deptCategory === 'intermediate';
      const wantsIntermediate = dto.category === 'intermediate';

      if (isIntermediate && !wantsIntermediate) {
        throw new BadRequestException(
          'This department only admits intermediate students',
        );
      }
      if (!isIntermediate && wantsIntermediate) {
        throw new BadRequestException(
          'This department does not admit intermediate students',
        );
      }
      if (!isIntermediate && !['bs', 'adp'].includes(dto.category)) {
        throw new BadRequestException('Category must be bs or adp');
      }
    }

    const token = randomBytes(24).toString('hex');

    // Built with the constructor rather than .create() so the nullable
    // category/class/expiresAt fields type-check against the schema.
    const created = new this.tokenModel({
      token,
      department: dto.department,
      category: dto.category ?? null,
      class: dto.class ?? null,
      session: dto.session ?? '2022-2026',
      maxUses: dto.maxUses ?? 100,
      usedCount: 0,
      isActive: true,
      expiresAt: dto.expiresInDays
        ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
        : null,
      createdBy,
      creatorDepartment: creatorDepartment ?? null,
    });
    await created.save();

    return {
      message: 'Registration link created',
      token: created.token,
      registrationUrl: `/register/${created.token}`,
      tokenRecord: this.serializeToken(created),
    };
  }

  async listTokens(departmentId?: string) {
    const filter = departmentId ? { department: departmentId } : {};
    const tokens = await this.tokenModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate('department', 'name code category')
      .lean()
      .exec();

    return { tokens: tokens.map((t: any) => this.serializeToken(t)) };
  }

  async revokeToken(tokenId: string) {
    const updated = await this.tokenModel
      .findByIdAndUpdate(tokenId, { $set: { isActive: false } }, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Registration link not found');
    return { message: 'Registration link revoked', token: this.serializeToken(updated) };
  }

  // Public: what a visitor needs to render the form, without exposing IDs
  // they could tamper with — the token itself is the authority.
  async getPublicTokenInfo(token: string) {
    const record = await this.tokenModel.findOne({ token }).lean().exec();
    if (!record) throw new NotFoundException('This registration link is not valid');

    if (!record.isActive) {
      throw new ForbiddenException('This registration link has been closed');
    }
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
      throw new ForbiddenException('This registration link has expired');
    }
    if (record.usedCount >= record.maxUses) {
      throw new ForbiddenException('This registration link has reached its limit');
    }

    const department = await this.departmentModel
      .findById(record.department)
      .select('name code category')
      .lean()
      .exec();

    // category falls back to the department's own category when the link is
    // not narrowed to bs vs adp.
    const resolvedCategory =
      record.category ??
      (department?.category === 'intermediate' ? 'intermediate' : null);

    return {
      department: { name: department?.name ?? '', code: department?.code ?? '' },
      category: resolvedCategory,
      class: record.class ?? null,
      session: record.session,
      remainingUses: Math.max(0, record.maxUses - record.usedCount),
      // Intermediate students are not asked for inter marks.
      requiresInterMarks: resolvedCategory !== 'intermediate',
    };
  }

  // ── Public self-registration ──
  async registerStudent(dto: RegisterStudentDto) {
    const tokenRecord = await this.tokenModel.findOne({ token: dto.registrationToken });

    if (!tokenRecord) {
      throw new NotFoundException('This registration link is not valid');
    }
    if (!tokenRecord.isActive) {
      throw new ForbiddenException('This registration link has been closed');
    }
    if (tokenRecord.expiresAt && new Date(tokenRecord.expiresAt) < new Date()) {
      throw new ForbiddenException('This registration link has expired');
    }
    if (tokenRecord.usedCount >= tokenRecord.maxUses) {
      throw new ForbiddenException('This registration link has reached its limit');
    }

    const department = await this.departmentModel
      .findById(tokenRecord.department)
      .select('code category')
      .lean()
      .exec();
    if (!department) throw new BadRequestException('Department not found');

    const category = tokenRecord.category
      ?? (department.category === 'intermediate' ? 'intermediate' : null);

    // Resolved from the token, not the request body — this is the only place
    // that knows the programme, so the inter-marks rule lives here.
    if (category !== 'intermediate') {
      if (dto.interMarks === undefined || dto.interMarks === null) {
        throw new BadRequestException('Inter marks are required for this programme');
      }
      if (
        Number.isNaN(Number(dto.interMarks)) ||
        Number(dto.interMarks) < 0 ||
        Number(dto.interMarks) > 1200
      ) {
        throw new BadRequestException('Inter marks must be between 0 and 1200');
      }
    }

    // Duplicate checks up front give a readable message; the unique index is
    // still the real guarantee (see the catch block below).
    const existing = await this.userModel
      .findOne({
        $or: [{ email: dto.email }, { cnic: dto.cnic }, { phone: dto.phone }],
      })
      .select('email cnic phone')
      .lean()
      .exec();

    if (existing) {
      const field =
        existing.email === dto.email
          ? 'Email'
          : existing.cnic === dto.cnic
            ? 'CNIC'
            : 'Phone';
      throw new ConflictException(
        `${field} is already registered. Please use the "forgot password" option.`,
      );
    }

    const verifyToken = randomBytes(32).toString('hex');
    const specialId = `STU-${department.code}-${dto.cnic.slice(-4)}`;

    try {
      const student = new this.userModel({
        role: 'student',
        name: dto.name.trim(),
        lastName: dto.lastName.trim(),
        email: dto.email.toLowerCase().trim(),
        phone: dto.phone,
        password: await bcrypt.hash(dto.password, 10),
        cnic: dto.cnic,
        gender: dto.gender ?? 'M',
        address: dto.address.trim(),
        city: dto.city.trim(),
        // Everything below is taken from the token, never from the request body.
        department: tokenRecord.department,
        category,
        // A locked link wins; otherwise the student picks from the allowed set.
        class: tokenRecord.class ?? dto.class ?? undefined,
        session: tokenRecord.session,
        rollNo: dto.rollNo,
        matricMarks: dto.matricMarks,
        ...(category !== 'intermediate' && { interMarks: dto.interMarks }),
        doj: dto.doj,
        ...(dto.whatsappNumber && { whatsappNumber: dto.whatsappNumber }),
        ...(dto.subjects && {
          subjects: dto.subjects
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
        specialId,
        verifyToken,
        isQrScanned: false,
        // Pending approval: login is blocked until an HOD/admin approves.
        approvalStatus: 'pending',
        isActive: false,
      });

      await student.save();

      await this.tokenModel.updateOne(
        { _id: tokenRecord._id },
        { $inc: { usedCount: 1 } },
      );

      return {
        message:
          'Application submitted. You will be able to log in once it is approved by your HOD or the administration.',
        specialId: student.specialId,
        approvalStatus: student.approvalStatus,
      };
    } catch (error: any) {
      // Lost the race between the check above and the insert.
      if (error?.code === 11000) {
        const field = Object.keys(error.keyValue ?? {})[0] ?? 'Account';
        throw new ConflictException(
          `${field} is already registered. Please use the "forgot password" option.`,
        );
      }
      throw error;
    }
  }

  // ── Approval queue ──
  async listPending(departmentId?: string, page = 1, limit = 25) {
    const filter: any = { role: 'student', approvalStatus: 'pending' };
    if (departmentId) filter.department = departmentId;

    const skip = (Math.max(1, page) - 1) * limit;

    const [students, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('-password -verifyToken')
        .populate('department', 'name code category')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    return {
      total,
      page: Math.max(1, page),
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      students,
    };
  }

  async reviewStudent(
    studentId: string,
    dto: ReviewRegistrationDto,
    reviewerId: string,
  ) {
    const student = await this.userModel.findById(studentId);
    if (!student) throw new NotFoundException('Student not found');
    if (student.role !== 'student') {
      throw new BadRequestException('This user is not a student');
    }
    if (student.approvalStatus !== 'pending') {
      throw new BadRequestException(
        'This application has already been reviewed',
      );
    }

    const approved = dto.decision === 'approved';

    student.approvalStatus = approved ? 'approved' : 'rejected';
    student.approvedAt = new Date();
    student.approvedBy = new Types.ObjectId(reviewerId);
    student.rejectionReason = approved ? null : (dto.reason ?? null);
    // Rejected accounts stay disabled so they cannot log in at all.
    student.isActive = approved;

    await student.save();

    return {
      message: approved
        ? 'Student approved. They can now log in.'
        : 'Student application rejected.',
      student: {
        _id: student._id,
        specialId: student.specialId,
        name: student.name,
        lastName: student.lastName,
        approvalStatus: student.approvalStatus,
        rejectionReason: student.rejectionReason,
      },
    };
  }

  private serializeToken(t: any) {
    return {
      _id: t._id,
      token: t.token,
      registrationUrl: `/register/${t.token}`,
      department: t.department,
      category: t.category ?? null,
      class: t.class ?? null,
      session: t.session,
      maxUses: t.maxUses,
      usedCount: t.usedCount,
      remainingUses: Math.max(0, t.maxUses - t.usedCount),
      isActive: t.isActive,
      expired: !!(t.expiresAt && new Date(t.expiresAt) < new Date()),
      expiresAt: t.expiresAt ?? null,
      createdAt: t.createdAt,
    };
  }
}
