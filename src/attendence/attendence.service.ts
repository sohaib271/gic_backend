// attendence.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Class, ClassDocument } from 'src/class/schema/class.schema';
import { Attendance, AttendenceDocument } from './schema/attendence.schema';
import { User, UserDocument } from 'src/user/schema/user.schema';
import {
  BulkAttendenceDto,
  CreateAttendenceDto,
  UpdateAttendenceDto,
} from './dto/attendence.dto';

@Injectable()
export class AttendenceService {
  constructor(
    @InjectModel(Class.name) private classModel: Model<ClassDocument>,
    @InjectModel(Attendance.name)
    private attendenceModel: Model<AttendenceDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  // ✅ Parse date string correctly — treat it as a local calendar date
// "2025-04-28" should mean April 28 regardless of server timezone

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

  async markAttendence(dto: CreateAttendenceDto) {
  const cls = await this.classModel.findById(dto.classId);
  if (!cls) throw new NotFoundException("Class does not exist");

  const teacher = await this.userModel.findOne({ _id: dto.teacherId, role: "proff" });
  if (!teacher) throw new NotFoundException("Teacher does not exist");

    // 3. Teacher must be assigned to this class
    const assignment = cls.assignes?.find(
      (a) => a.teacherId.toString() === dto.teacherId,
    );
    if (
      !assignment ||
      !assignment.schedule ||
      assignment.schedule.length === 0
    ) {
      throw new BadRequestException(
        'Teacher has no schedule assigned in this class',
      );
    }

  const isEnrolled = cls.classStudents?.some((id) => id.toString() === dto.studentId);
  if (!isEnrolled) throw new BadRequestException("Student is not enrolled in this class");

  // ✅ Timezone-safe date parsing
  const { dayStart, dayEnd, dayName } = this.parseDateToUTCRange(dto.date);

  // ✅ Check duplicate
  const duplicate = await this.attendenceModel.findOne({
    classId:   dto.classId,
    studentId: dto.studentId,
    teacherId: dto.teacherId,
    date:      { $gte: dayStart, $lte: dayEnd },
    ...(dto.lectureNumber !== undefined && { lectureNumber: dto.lectureNumber }),
  });
  if (duplicate) {
    throw new ConflictException("Attendance already marked for this student on this date");
  }

  // ✅ Check date is today
  const nowUTC      = new Date();
  const todayUTCStr = nowUTC.toISOString().split("T")[0];
  const pktNow      = new Date(nowUTC.getTime() + 5 * 60 * 60 * 1000);
  const pktTodayStr = pktNow.toISOString().split("T")[0];
  if (dto.date !== todayUTCStr && dto.date !== pktTodayStr) {
    throw new ForbiddenException("You can only mark attendance for today's date");
  }

  // ✅ Check schedule day
  const scheduledSlot = assignment.schedule.find(
    (s) => s.day.toLowerCase() === dayName.toLowerCase()
  );
  if (!scheduledSlot) {
    throw new ForbiddenException(`You are not scheduled to teach on ${dayName}`);
  }

  // ✅ Check time window in PKT
  const { nowTotal } = this.getNowInPKT();
  const [startH, startM] = scheduledSlot.startTime.split(":").map(Number);
  const [endH,   endM]   = scheduledSlot.endTime.split(":").map(Number);
  const startTotal = startH * 60 + startM;
  const endTotal   = endH   * 60 + endM;

  if (nowTotal < startTotal || nowTotal > endTotal) {
    throw new ForbiddenException(
      `Attendance can only be marked during: ${scheduledSlot.startTime} – ${scheduledSlot.endTime}`
    );
  }

  const record = new this.attendenceModel({
    classId:          dto.classId,
    studentId:        dto.studentId,
    teacherId:        dto.teacherId,
    attendenceStatus: dto.attendenceStatus,
    date:             dayStart, // ✅ UTC midnight
    lectureNumber:    dto.lectureNumber,
  });

  await record.save();
  return { message: "Attendance marked successfully", record };
}

  // attendence.service.ts — add this method
  async getMyAttendanceHistory(teacherId: string, classId?: string) {
    const filter: any = { teacherId };
    if (classId) filter.classId = classId;

    const records = await this.attendenceModel
      .find(filter)
      .populate({ path: 'studentId', select: 'name lastName specialId' })
      .populate({ path: 'classId', select: 'className category session' })
      .sort({ date: -1 });

    // ✅ Group by classId → date → records
    const grouped: Record<
      string,
      { className: string; dates: Record<string, any[]> }
    > = {};

    records.forEach((r: any) => {
      const cid = r.classId?._id?.toString();
      const cname = r.classId?.className ?? 'Unknown';
      const dateKey = new Date(r.date).toISOString().split('T')[0];

      if (!grouped[cid]) grouped[cid] = { className: cname, dates: {} };
      if (!grouped[cid].dates[dateKey]) grouped[cid].dates[dateKey] = [];
      grouped[cid].dates[dateKey].push(r);
    });

    return { history: grouped, total: records.length };
  }

  // ── Also add: get attendance for a specific class+date (for professor view)
  async getClassAttendanceForTeacher(
    classId: string,
    teacherId: string,
    date: string,
  ) {
    const cls = await this.classModel.findById(classId);
    if (!cls) throw new NotFoundException('Class does not exist');

    const isAssigned = await this.isAssigned(teacherId, classId);
    if (!isAssigned)
      throw new ForbiddenException('You are not assigned to this class');

 const { dayStart, dayEnd } = this.parseDateToUTCRange(date);

    const records = await this.attendenceModel
      .find({ classId, teacherId, date: { $gte: dayStart, $lte: dayEnd } })
      .populate({ path: 'studentId', select: 'name lastName specialId' })
      .sort({ createdAt: 1 });

    return { date, classId, records, total: records.length };
  }

  async markBulkAttendence(dto: BulkAttendenceDto) {
    // 1. Validate class
    const cls = await this.classModel.findById(dto.classId);
    if (!cls) throw new NotFoundException('Class does not exist');

    // 2. Validate teacher
    const teacher = await this.userModel.findOne({
      _id: dto.teacherId,
      role: 'proff',
    });
    if (!teacher) throw new NotFoundException('Teacher does not exist');

  // 3. Find assignment + schedule
  const assignment = cls.assignes?.find(
    (a) => a.teacherId.toString() === dto.teacherId
  );
  if (!assignment) throw new ForbiddenException("Teacher is not assigned to this class");
  if (!assignment.schedule || assignment.schedule.length === 0) {
    throw new BadRequestException("Teacher has no schedule assigned in this class");
  }

  // 4. ✅ Parse date correctly (timezone-safe)
  const { dayStart, dayEnd, dayName } = this.parseDateToUTCRange(dto.date);

  // 5. ✅ Check date is today (compare in UTC)
  const nowUTC       = new Date();
  const todayUTCStr  = nowUTC.toISOString().split("T")[0]; // "2025-04-28"
  if (dto.date !== todayUTCStr) {
    // ✅ Also check PKT date (if server is UTC but school is PKT)
    const pktOffset    = 5 * 60 * 60 * 1000; // 5 hours in ms
    const pktNow       = new Date(nowUTC.getTime() + pktOffset);
    const pktTodayStr  = pktNow.toISOString().split("T")[0];

    if (dto.date !== pktTodayStr) {
      throw new ForbiddenException("You can only mark attendance for today's date");
    }
  }

  // 6. ✅ Check teacher is scheduled on this day
  const scheduledSlot = assignment.schedule.find(
    (s) => s.day.toLowerCase() === dayName.toLowerCase()
  );
  if (!scheduledSlot) {
    throw new ForbiddenException(
      `You are not scheduled to teach on ${dayName}. Cannot mark attendance for this date.`
    );
  }

  // 7. ✅ Check current time is within lecture window (in PKT)
  const { nowTotal } = this.getNowInPKT();

    const [startH, startM] = scheduledSlot.startTime.split(':').map(Number);
    const [endH, endM] = scheduledSlot.endTime.split(':').map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;

    if (nowTotal < startTotal || nowTotal > endTotal) {
      throw new ForbiddenException(
        `Attendance can only be marked during lecture hours: ${scheduledSlot.startTime} – ${scheduledSlot.endTime}`,
      );
    }

  // 8. Validate students are enrolled
  const enrolledIds     = new Set(cls.classStudents?.map((id) => id.toString()));
  const invalidStudents = dto.records.filter((r) => !enrolledIds.has(r.studentId));
  if (invalidStudents.length > 0) {
    throw new BadRequestException(
      `These students are not enrolled: ${invalidStudents.map((r) => r.studentId).join(", ")}`
    );
  }

  // 9. Check for duplicate attendance
  const existingRecords = await this.attendenceModel.find({
    classId:   dto.classId,
    teacherId: dto.teacherId,
    date:      { $gte: dayStart, $lte: dayEnd },
    ...(dto.lectureNumber !== undefined && { lectureNumber: dto.lectureNumber }),
  });

    if (existingRecords.length > 0) {
      throw new ConflictException(
        dto.lectureNumber !== undefined
          ? `Attendance already marked for lecture ${dto.lectureNumber} on this date`
          : 'Attendance already marked for this class on this date',
      );
    }

  // 10. Bulk insert
  const records = dto.records.map((r) => ({
    classId:          dto.classId,
    studentId:        r.studentId,
    teacherId:        dto.teacherId,
    attendenceStatus: r.attendenceStatus,
    date:             dayStart, // ✅ store UTC midnight, not raw string
    lectureNumber:    dto.lectureNumber,
  }));

  await this.attendenceModel.insertMany(records);
  return { message: `Attendance marked for ${records.length} students`, date: dto.date, classId: dto.classId };
}

  // ── Get attendance for a class on a specific date ─────────
  async getClassAttendenceByDate(classId: string, date: string) {
    const cls = await this.classModel.findById(classId);
    if (!cls) throw new NotFoundException('Class does not exist');

   const { dayStart, dayEnd } = this.parseDateToUTCRange(date);

    const records = await this.attendenceModel
      .find({ classId, date: { $gte: dayStart, $lte: dayEnd } })
      .populate({ path: 'studentId', select: 'name lastName specialId' })
      .populate({ path: 'teacherId', select: 'name lastName' })
      .sort({ lectureNumber: 1 });

    return { date, classId, total: records.length, records };
  }

  // ── Get attendance summary for a student in a class ───────
  async getStudentAttendence(classId: string, studentId: string) {
    const records = await this.attendenceModel.find({ classId, studentId });

    const total = records.length;
    const present = records.filter((r) => r.attendenceStatus === 'P').length;
    const absent = records.filter((r) => r.attendenceStatus === 'A').length;
    const leave = records.filter((r) => r.attendenceStatus === 'L').length;
    const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : '0.0';

    return {
      classId,
      studentId,
      total,
      present,
      absent,
      leave,
      percentage,
      records,
    };
  }

  // ── Get student attendance by date or class ───────────────
  async getStudentAttendanceByDate(
    studentId: string,
    date?: string,
    classId?: string,
  ) {
    const filter: any = { studentId };
    if (classId) filter.classId = classId;

    if (date) {
      const dateObj = new Date(date);
      if (Number.isNaN(dateObj.getTime())) {
        throw new BadRequestException('Invalid date format');
      }
      const dayStart = new Date(new Date(dateObj).setHours(0, 0, 0, 0));
      const dayEnd = new Date(new Date(dateObj).setHours(23, 59, 59, 999));
      filter.date = { $gte: dayStart, $lte: dayEnd };
    }

    const records = await this.attendenceModel
      .find(filter)
      .populate({ path: 'classId', select: 'className category session' })
      .populate({ path: 'teacherId', select: 'name lastName' })
      .sort({ date: -1, lectureNumber: 1 });

    const total = records.length;
    const present = records.filter((r) => r.attendenceStatus === 'P').length;
    const absent = records.filter((r) => r.attendenceStatus === 'A').length;
    const leave = records.filter((r) => r.attendenceStatus === 'L').length;

    const groupedByDate = records.reduce(
      (acc: Record<string, any[]>, record: any) => {
        const key = new Date(record.date).toISOString().split('T')[0];
        acc[key] = acc[key] ?? [];
        acc[key].push(record);
        return acc;
      },
      {},
    );

    return {
      studentId,
      classId: classId ?? null,
      date: date ?? null,
      total,
      present,
      absent,
      leave,
      percentage: total > 0 ? ((present / total) * 100).toFixed(1) : '0.0',
      groupedByDate,
      records,
    };
  }

 async updateAttendance(attendanceId: string, dto: UpdateAttendenceDto) {
  const cls = await this.classModel.findById(dto.classId);
  if (!cls) throw new NotFoundException("Class does not exist");

  const teacher = await this.userModel.findOne({ _id: dto.teacherId, role: "proff" });
  if (!teacher) throw new NotFoundException("Teacher does not exist");

  const isAssigned = await this.isAssigned(dto.teacherId, dto.classId);
  if (!isAssigned) throw new ForbiddenException("Teacher is not assigned to this class");

  const isEnrolled = cls.classStudents?.some((id) => id.toString() === dto.studentId);
  if (!isEnrolled) throw new BadRequestException("Student is not enrolled in this class");

  const record = await this.attendenceModel.findById(attendanceId);
  if (!record) throw new NotFoundException("Attendance record not found");

  if (record.teacherId.toString() !== dto.teacherId || record.classId.toString() !== dto.classId) {
    throw new ForbiddenException("You are not authorized to update this attendance record");
  }

  const assignment = cls.assignes?.find((a) => a.teacherId.toString() === dto.teacherId);
  if (!assignment || !assignment.schedule || assignment.schedule.length === 0) {
    throw new BadRequestException("Teacher has no schedule assigned in this class");
  }

  // ✅ Get record date as UTC string then parse safely
  const recordDateStr = new Date(record.date).toISOString().split("T")[0];
  const { dayName }   = this.parseDateToUTCRange(recordDateStr);

  // ✅ Check record is today
  const nowUTC      = new Date();
  const todayUTCStr = nowUTC.toISOString().split("T")[0];
  const pktNow      = new Date(nowUTC.getTime() + 5 * 60 * 60 * 1000);
  const pktTodayStr = pktNow.toISOString().split("T")[0];
  if (recordDateStr !== todayUTCStr && recordDateStr !== pktTodayStr) {
    throw new ForbiddenException("You can only update attendance for today's date");
  }

  // ✅ Check schedule matches day
  const scheduledSlot = assignment.schedule.find(
    (s) => s.day.toLowerCase() === dayName.toLowerCase()
  );
  if (!scheduledSlot) {
    throw new ForbiddenException(`You are not scheduled to teach on ${dayName}`);
  }

  // ✅ Check time window in PKT
  const { nowTotal } = this.getNowInPKT();
  const [startH, startM] = scheduledSlot.startTime.split(":").map(Number);
  const [endH,   endM]   = scheduledSlot.endTime.split(":").map(Number);
  const startTotal = startH * 60 + startM;
  const endTotal   = endH   * 60 + endM;

  if (nowTotal < startTotal || nowTotal > endTotal) {
    throw new ForbiddenException(
      `Attendance can only be updated during: ${scheduledSlot.startTime} – ${scheduledSlot.endTime}`
    );
  }

  record.attendenceStatus = dto.attendenceStatus;
  await record.save();
  return { message: "Attendance updated successfully", record };
}

  // ── helpers ───────────────────────────────────────────────
  private async isAssigned(
    teacherId: string,
    classId: string,
  ): Promise<boolean> {
    const assignment = await this.classModel.findOne({
      _id: classId,
      'assignes.teacherId': teacherId,
    });
    return !!assignment;
  }
}
