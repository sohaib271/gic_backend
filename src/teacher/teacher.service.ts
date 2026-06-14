import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as QRCode from 'qrcode';
import { Class, ClassDocument } from 'src/class/schema/class.schema';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { TeacherAttendanceDto } from './dto/teacherAttendanceDto';
import { TeacherAttendance, TeacherAttendanceDocument } from './schema/teacherAttendance';

@Injectable()
export class TeacherService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Class.name) private readonly classModel: Model<ClassDocument>,
    @InjectModel(TeacherAttendance.name) private readonly teacherAttendanceModel: Model<TeacherAttendanceDocument>,
  ) {}

  parseDateToUTCRange(dateStr: string): { dayStart: Date; dayEnd: Date; dayName: string } {
  // Split and build UTC midnight explicitly to avoid timezone shifts
  const [year, month, day] = dateStr.split("-").map(Number);

  // ✅ Build as UTC so server timezone doesn't shift the date
  const dayStart = new Date(Date.UTC(year, month - 1, day, 0,  0,  0, 0));
  const dayEnd   = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const dayName  = dayNames[dayStart.getUTCDay()]; // ✅ use getUTCDay() not getDay()

  return { dayStart, dayEnd, dayName };
}

// ✅ Get current time in PKT (UTC+5) — needed if your school is in Pakistan
getNowInPKT():{ nowTotal: number } {
  const now        = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const pktOffset  = 5 * 60; // PKT = UTC+5
  const pktMinutes = (utcMinutes + pktOffset) % (24 * 60);
  return { nowTotal: pktMinutes };
}

  async markTeacherAttendance(dto: TeacherAttendanceDto, teacherId: string) {
  const teacher = await this.userModel.findOne({ _id: teacherId, role: 'proff' }).lean();
  if (!teacher) throw new NotFoundException('Teacher not found');

  // ✅ Compare by day range, not exact timestamp
  const date     = dto.currentDate ? new Date(dto.currentDate) : new Date();
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0,  0,  0, 0));
  const dayEnd   = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

  const lastAttendance = await this.teacherAttendanceModel.findOne({
    teacherId,
    type:        dto.type,
    currentDate: { $gte: dayStart, $lte: dayEnd },
  }).lean();

  if (lastAttendance) {
    throw new BadRequestException(`You have already marked ${dto.type} for today`);
  }

  // ✅ Also enforce check-in before check-out
  if (dto.type === 'check-out') {
    const checkIn = await this.teacherAttendanceModel.findOne({
      teacherId,
      type:        'check-in',
      currentDate: { $gte: dayStart, $lte: dayEnd },
    }).lean();

    if (!checkIn) {
      throw new BadRequestException('You must check-in before checking out');
    }
  }

  const newAttendance = new this.teacherAttendanceModel({
    ...dto,
    teacherId,
    currentDate: date,
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
  const now      = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0,  0,  0, 0));
  const dayEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  const [checkIn, checkOut] = await Promise.all([
    this.teacherAttendanceModel.findOne({
      teacherId, type: 'check-in', currentDate: { $gte: dayStart, $lte: dayEnd },
    }).lean(),
    this.teacherAttendanceModel.findOne({
      teacherId, type: 'check-out', currentDate: { $gte: dayStart, $lte: dayEnd },
    }).lean(),
  ]);

  return {
    success:        true,
    hasCheckedIn:   Boolean(checkIn),
    hasCheckedOut:  Boolean(checkOut),
    checkInTime:    checkIn  ? (checkIn  as any).currentDate : null,
    checkOutTime:   checkOut ? (checkOut as any).currentDate : null,
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
    name:      `${(teacher as any).name} ${(teacher as any).lastName ?? ''}`.trim(),
    exp:       Date.now() + 1 * 60 * 1000, // expires in 1 minute
  });

  const qrDataUrl = await QRCode.toDataURL(payload, {
    width:           300,
    margin:          2,
    color:           { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });

  return { success: true, qrDataUrl, teacherId, expiresIn: '1 minute' };
}

async generateSharedQR() {
  const payload = JSON.stringify({
    type: "faculty-attendance",
    exp:  Date.now() + 1 * 60 * 1000, // expires in 1 minute
  });
 
  const qrDataUrl = await QRCode.toDataURL(payload, {
    width:                300,
    margin:               2,
    color:                { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });
 
  return { success: true, qrDataUrl, expiresIn: '1 minute' };
}

  async getRecord(){
    const records = await this.teacherAttendanceModel.find().populate({path:'teacherId',select:'name lastName'}).lean();

    if(!records || records.length === 0){
      throw new NotFoundException('No attendance records found');
    }

    return {
      success: true,
      records
    }
  }

  async getTeacherAttendance(teacherId: string) {
    const teacher = await this.userModel.findOne({ _id: teacherId, role: 'proff' }).lean();

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }
    const attendanceRecords = await this.teacherAttendanceModel.find({ teacherId }).populate({path:"teacherId",select:'name lastName'}).lean();

    if(!attendanceRecords || attendanceRecords.length === 0){
      throw new NotFoundException('No attendance records found for this teacher');
    }

    return {
      success: true,
      attendanceRecords
    };
  }

  async getMyAttendance(teacherId: string) {
    const teacher = await this.userModel.findOne({ _id: teacherId, role: 'proff' }).lean();

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }
    const attendanceRecords = await this.teacherAttendanceModel.find({ teacherId }).populate({path:"teacherId",select:'name lastName'}).lean();

    if(!attendanceRecords || attendanceRecords.length === 0){
      throw new NotFoundException('No attendance record exist');
    }

    return {
      success: true,
      attendanceRecords
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
