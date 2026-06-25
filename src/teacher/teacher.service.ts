import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { Class, ClassDocument } from 'src/class/schema/class.schema';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { TeacherAttendanceDto } from './dto/teacherAttendanceDto';
import {
  TeacherAttendance,
  TeacherAttendanceDocument,
} from './schema/teacherAttendance';

@Injectable()
export class TeacherService {
  private readonly QR_SECRET =
    process.env.QR_SECRET || 'your-secret-key-change-in-env';

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Class.name) private readonly classModel: Model<ClassDocument>,
    @InjectModel(TeacherAttendance.name)
    private readonly teacherAttendanceModel: Model<TeacherAttendanceDocument>,
  ) {}

  private isPaginationRequested(page?: number, limit?: number) {
    return Number.isFinite(page) || Number.isFinite(limit);
  }

  private getPagination(page?: number, limit?: number) {
    const safePage = Number.isFinite(page) && page && page > 0 ? Math.floor(page) : 1;
    const safeLimit = Number.isFinite(limit) && limit && limit > 0 ? Math.min(Math.floor(limit), 100) : 25;
    return {
      page: safePage,
      limit: safeLimit,
      skip: (safePage - 1) * safeLimit,
    };
  }

  private paginationMeta(total: number, page: number, limit: number) {
    return {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ✅ Sign payload with HMAC-SHA256
  private signPayload(data: string): string {
    return crypto
      .createHmac('sha256', this.QR_SECRET)
      .update(data)
      .digest('hex');
  }

  // ✅ Verify payload signature
  verifyQRSignature(payload: any, signature: string): boolean {
    try {
      const payloadStr = JSON.stringify({
        type: payload.type,
        exp: payload.exp,
      });
      const expectedSignature = this.signPayload(payloadStr);
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      );
    } catch {
      return false;
    }
  }

  parseDateToUTCRange(dateStr: string): {
    dayStart: Date;
    dayEnd: Date;
    dayName: string;
  } {
    // Split and build UTC midnight explicitly to avoid timezone shifts
    const [year, month, day] = dateStr.split('-').map(Number);

    // ✅ Build as UTC so server timezone doesn't shift the date
    const dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    const dayName = dayNames[dayStart.getUTCDay()]; // ✅ use getUTCDay() not getDay()

    return { dayStart, dayEnd, dayName };
  }

  // ✅ Get current time in PKT (UTC+5) — needed if your school is in Pakistan
  getNowInPKT(): { nowTotal: number } {
    const now = new Date();
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const pktOffset = 5 * 60; // PKT = UTC+5
    const pktMinutes = (utcMinutes + pktOffset) % (24 * 60);
    return { nowTotal: pktMinutes };
  }

  async markTeacherAttendance(dto: TeacherAttendanceDto, teacherId: string) {
    const teacher = await this.userModel
      .findOne({ _id: teacherId, role: 'proff' })
      .lean();
    if (!teacher) throw new NotFoundException('Teacher not found');

    // ✅ Validate QR signature if provided
    if (dto.qrPayload && dto.qrSignature) {
      try {
        const payload = JSON.parse(dto.qrPayload);
        if (!this.verifyQRSignature(payload, dto.qrSignature)) {
          throw new BadRequestException(
            'Invalid or tampered QR code. Please scan a valid attendance QR.',
          );
        }
        // ✅ Check if QR has expired
        if (payload.exp && Date.now() > payload.exp) {
          throw new BadRequestException(
            'QR code has expired. Please ask admin to generate a new one.',
          );
        }
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException('Invalid QR code format.');
      }
    }

    // ✅ Compare by day range, not exact timestamp
    const date = dto.currentDate ? new Date(dto.currentDate) : new Date();
    const dayStart = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    const dayEnd = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );

    const lastAttendance = await this.teacherAttendanceModel
      .findOne({
        teacherId,
        type: dto.type,
        currentDate: { $gte: dayStart, $lte: dayEnd },
      })
      .lean();

    if (lastAttendance) {
      throw new BadRequestException(
        `You have already marked ${dto.type} for today`,
      );
    }

    // ✅ Also enforce check-in before check-out
    if (dto.type === 'check-out') {
      const checkIn = await this.teacherAttendanceModel
        .findOne({
          teacherId,
          type: 'check-in',
          currentDate: { $gte: dayStart, $lte: dayEnd },
        })
        .lean();

      if (!checkIn) {
        throw new BadRequestException('You must check-in before checking out');
      }
    }

    const newAttendance = new this.teacherAttendanceModel({
      teacherId,
      currentDate: date,
      type: dto.type,
      gps: dto.gps,
      macAddress: dto.macAddress, // ✅ Store MAC address
      qrSignature: dto.qrSignature, // ✅ Store signature for audit
    });

    await newAttendance.save();

    return {
      success: true,
      message: `${dto.type === 'check-in' ? 'Checked in' : 'Checked out'} successfully`,
      newAttendance,
    };
  }

  // teacher.service.ts
  async getTodayAttendanceStatus(teacherId: string) {
    const now = new Date();
    const dayStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    const dayEnd = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );

    const [checkIn, checkOut] = await Promise.all([
      this.teacherAttendanceModel
        .findOne({
          teacherId,
          type: 'check-in',
          currentDate: { $gte: dayStart, $lte: dayEnd },
        })
        .lean(),
      this.teacherAttendanceModel
        .findOne({
          teacherId,
          type: 'check-out',
          currentDate: { $gte: dayStart, $lte: dayEnd },
        })
        .lean(),
    ]);

    return {
      success: true,
      hasCheckedIn: Boolean(checkIn),
      hasCheckedOut: Boolean(checkOut),
      checkInTime: checkIn ? (checkIn as any).currentDate : null,
      checkOutTime: checkOut ? (checkOut as any).currentDate : null,
    };
  }

  async generateTeacherQR(teacherId: string) {
    if (!Types.ObjectId.isValid(teacherId)) {
      throw new BadRequestException('Invalid teacher ID');
    }

    const teacher = await this.userModel
      .findOne({ _id: teacherId, role: 'proff' })
      .select('name lastName specialId')
      .lean();

    if (!teacher) throw new NotFoundException('Teacher not found');

    // ✅ QR encodes a signed payload with teacherId + timestamp
    const payload = JSON.stringify({
      teacherId,
      specialId: (teacher as any).specialId,
      name: `${(teacher as any).name} ${(teacher as any).lastName ?? ''}`.trim(),
      exp: Date.now() + 5 * 60 * 1000, // expires in 5 minutes
    });

    const qrDataUrl = await QRCode.toDataURL(payload, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });

    return { success: true, qrDataUrl, teacherId, expiresIn: '5 minutes' };
  }

  async generateSharedQR() {
    const payload = {
      type: 'faculty-attendance',
      exp: Date.now() + 5 * 60 * 1000, // expires in 5 minutes
    };

    const payloadStr = JSON.stringify(payload);
    const signature = this.signPayload(payloadStr);

    const qrData = JSON.stringify({
      ...payload,
      sig: signature,
    });

    const qrDataUrl = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });

    return { success: true, qrDataUrl, expiresIn: '5 minutes' };
  }

  async getRecord(page?: number, limit?: number) {
    const shouldPaginate = this.isPaginationRequested(page, limit);
    const pagination = this.getPagination(page, limit);
    const query = this.teacherAttendanceModel
      .find()
      .populate({ path: 'teacherId', select: 'name lastName' })
      .sort({ currentDate: -1 })
      .lean();
    if (shouldPaginate) query.skip(pagination.skip).limit(pagination.limit);

    const [records, total] = await Promise.all([
      query,
      shouldPaginate ? this.teacherAttendanceModel.countDocuments() : Promise.resolve(0),
    ]);

    if (!records || records.length === 0) {
      throw new NotFoundException('No attendance records found');
    }

    return {
      success: true,
      records,
      ...(shouldPaginate ? this.paginationMeta(total, pagination.page, pagination.limit) : {}),
    };
  }

  async getTeacherAttendance(teacherId: string, page?: number, limit?: number) {
    const teacher = await this.userModel
      .findOne({ _id: teacherId, role: 'proff' })
      .lean();

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }
    const shouldPaginate = this.isPaginationRequested(page, limit);
    const pagination = this.getPagination(page, limit);
    const filter = { teacherId };
    const query = this.teacherAttendanceModel
      .find(filter)
      .populate({ path: 'teacherId', select: 'name lastName' })
      .sort({ currentDate: -1 })
      .lean();
    if (shouldPaginate) query.skip(pagination.skip).limit(pagination.limit);

    const [attendanceRecords, total] = await Promise.all([
      query,
      shouldPaginate ? this.teacherAttendanceModel.countDocuments(filter) : Promise.resolve(0),
    ]);

    if (!attendanceRecords || attendanceRecords.length === 0) {
      throw new NotFoundException(
        'No attendance records found for this teacher',
      );
    }

    return {
      success: true,
      attendanceRecords,
      ...(shouldPaginate ? this.paginationMeta(total, pagination.page, pagination.limit) : {}),
    };
  }

  async getMyAttendance(teacherId: string, page?: number, limit?: number) {
    const teacher = await this.userModel
      .findOne({ _id: teacherId, role: 'proff' })
      .lean();

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }
    const shouldPaginate = this.isPaginationRequested(page, limit);
    const pagination = this.getPagination(page, limit);
    const filter = { teacherId };
    const query = this.teacherAttendanceModel
      .find(filter)
      .populate({ path: 'teacherId', select: 'name lastName' })
      .sort({ currentDate: -1 })
      .lean();
    if (shouldPaginate) query.skip(pagination.skip).limit(pagination.limit);

    const [attendanceRecords, total] = await Promise.all([
      query,
      shouldPaginate ? this.teacherAttendanceModel.countDocuments(filter) : Promise.resolve(0),
    ]);

    if (!attendanceRecords || attendanceRecords.length === 0) {
      throw new NotFoundException('No attendance record exist');
    }

    return {
      success: true,
      attendanceRecords,
      ...(shouldPaginate ? this.paginationMeta(total, pagination.page, pagination.limit) : {}),
    };
  }
  async getMyAssignedStudents(teacherId: string) {
    const teacher = await this.userModel
      .findOne({ _id: teacherId, role: 'proff' })
      .select('_id role')
      .lean();

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    const classes = await this.classModel
      .find({ 'assignes.teacherId': teacherId })
      .select('className class session category classStudents')
      .populate({
        path: 'classStudents',
        select: 'name lastName rollNo',
      })
      .lean();

    const data = classes.map((classItem: any) => ({
      classId: classItem._id?.toString(),
      className: classItem.className,
      students: (classItem.classStudents ?? [])
        .filter(Boolean)
        .map((student: any) => ({
          id: student?._id?.toString(),
          name: [student?.name, student?.lastName].filter(Boolean).join(' '),
          rollNo:
            student?.rollNo !== undefined && student?.rollNo !== null
              ? String(student.rollNo)
              : null,
        })),
    }));

    return {
      success: true,
      data,
    };
  }
}
