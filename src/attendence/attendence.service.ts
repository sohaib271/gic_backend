// attendence.service.ts
import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Class, ClassDocument } from "src/class/schema/class.schema";
import { Attendance, AttendenceDocument } from "./schema/attendence.schema";
import { User, UserDocument } from "src/user/schema/user.schema";
import { BulkAttendenceDto, CreateAttendenceDto, UpdateAttendenceDto } from "./dto/attendence.dto";

@Injectable()
export class AttendenceService {
  constructor(
    @InjectModel(Class.name)      private classModel:      Model<ClassDocument>,
    @InjectModel(Attendance.name) private attendenceModel: Model<AttendenceDocument>,
    @InjectModel(User.name)       private userModel:       Model<UserDocument>,
  ) {}

  // ── Mark attendance for a single student ─────────────────
  async markAttendence(dto: CreateAttendenceDto) {
    // 1. Validate class exists
    const cls = await this.classModel.findById(dto.classId);
    if (!cls) throw new NotFoundException("Class does not exist");

    // 2. Validate teacher exists
    const teacher = await this.userModel.findOne({ _id: dto.teacherId, role: "proff" });
    if (!teacher) throw new NotFoundException("Teacher does not exist");

    // 3. Teacher must be assigned to this class
      const assignment = cls.assignes?.find(
    (a) => a.teacherId.toString() === dto.teacherId
  );
  if (!assignment || !assignment.schedule || assignment.schedule.length === 0) {
    throw new BadRequestException("Teacher has no schedule assigned in this class");
  }

    // 4. Student must be enrolled in this class
    const isEnrolled = cls.classStudents?.some(
      (id) => id.toString() === dto.studentId
    );
    if (!isEnrolled) {
      throw new BadRequestException("Student is not enrolled in this class");
    }

    // 5. Prevent duplicate attendance for same student/date/lecture
    const dateObj  = new Date(dto.date);
    const dayStart = new Date(dateObj.setHours(0,  0,  0, 0));
    const dayEnd   = new Date(dateObj.setHours(23, 59, 59, 999));

    const duplicate = await this.attendenceModel.findOne({
      classId:   dto.classId,
      studentId: dto.studentId,
      teacherId: dto.teacherId,
      date:      { $gte: dayStart, $lte: dayEnd },
      ...(dto.lectureNumber !== undefined && { lectureNumber: dto.lectureNumber }),
    });

    if (duplicate) {
      throw new ConflictException(
        dto.lectureNumber !== undefined
          ? `Attendance already marked for this student in lecture ${dto.lectureNumber} on this date`
          : "Attendance already marked for this student on this date"
      );
    }


  const dayNames   = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const recordDay  = dayNames[dateObj.getDay()]; // e.g. "Monday"

  // 9. ✅ Find matching schedule entry for this day
  const scheduledSlot = assignment.schedule.find(
    (s) => s.day.toLowerCase() === recordDay.toLowerCase()
  );
  if (!scheduledSlot) {
    throw new ForbiddenException(
      `You are not scheduled to teach on ${recordDay}. Cannot mark attendance for this date.`
    );
  }

  // 10. ✅ Validate current time is within the lecture window
  const now       = new Date();
  const nowHours  = now.getHours();
  const nowMins   = now.getMinutes();
  const nowTotal  = nowHours * 60 + nowMins; // current time in total minutes

  // Parse startTime and endTime (format: "HH:MM")
  const [startH, startM] = scheduledSlot.startTime.split(":").map(Number);
  const [endH,   endM]   = scheduledSlot.endTime.split(":").map(Number);
  const startTotal = startH * 60 + startM;
  const endTotal   = endH   * 60 + endM;

  // 11. ✅ Validate the update is happening on the same date as the record
  const today        = new Date();
  const todayStart   = new Date(today.setHours(0,  0,  0, 0));
  const todayEnd     = new Date(today.setHours(23, 59, 59, 999));
  const recordDateMs = dateObj.getTime();

  if (recordDateMs < todayStart.getTime() || recordDateMs > todayEnd.getTime()) {
    throw new ForbiddenException(
      "You can only mark attendance for today's date"
    );
  }

  // 12. ✅ Validate current time is within the scheduled lecture window
  if (nowTotal < startTotal || nowTotal > endTotal) {
    throw new ForbiddenException(
      `Attendance can only be marked during the lecture hours: ${scheduledSlot.startTime} – ${scheduledSlot.endTime}`
    );
  }

    // 6. Save
    const record = new this.attendenceModel({
      classId:          dto.classId,
      studentId:        dto.studentId,
      teacherId:        dto.teacherId,
      attendenceStatus: dto.attendenceStatus,
      date:             new Date(dto.date),
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
    .populate({ path: "studentId", select: "name lastName specialId" })
    .populate({ path: "classId",   select: "className category session" })
    .sort({ date: -1 });

  // ✅ Group by classId → date → records
  const grouped: Record<string, { className: string; dates: Record<string, any[]> }> = {};

  records.forEach((r: any) => {
    const cid   = r.classId?._id?.toString();
    const cname = r.classId?.className ?? "Unknown";
    const dateKey = new Date(r.date).toISOString().split("T")[0];

    if (!grouped[cid]) grouped[cid] = { className: cname, dates: {} };
    if (!grouped[cid].dates[dateKey]) grouped[cid].dates[dateKey] = [];
    grouped[cid].dates[dateKey].push(r);
  });

  return { history: grouped, total: records.length };
}

// ── Also add: get attendance for a specific class+date (for professor view)
async getClassAttendanceForTeacher(classId: string, teacherId: string, date: string) {
  const cls = await this.classModel.findById(classId);
  if (!cls) throw new NotFoundException("Class does not exist");

  const isAssigned = await this.isAssigned(teacherId, classId);
  if (!isAssigned) throw new ForbiddenException("You are not assigned to this class");

  const dateObj  = new Date(date);
  const dayStart = new Date(new Date(dateObj).setHours(0,  0,  0, 0));
  const dayEnd   = new Date(new Date(dateObj).setHours(23, 59, 59, 999));

  const records = await this.attendenceModel
    .find({ classId, teacherId, date: { $gte: dayStart, $lte: dayEnd } })
    .populate({ path: "studentId", select: "name lastName specialId" })
    .sort({ createdAt: 1 });

  return { date, classId, records, total: records.length };
}

  // ── Mark attendance for entire class in one request ───────
  async markBulkAttendence(dto: BulkAttendenceDto) {
  // 1. Validate class
  const cls = await this.classModel.findById(dto.classId);
  if (!cls) throw new NotFoundException("Class does not exist");

  // 2. Validate teacher
  const teacher = await this.userModel.findOne({ _id: dto.teacherId, role: "proff" });
  if (!teacher) throw new NotFoundException("Teacher does not exist");

  // 3. ✅ Find assignment (not just isAssigned — we need the schedule too)
  const assignment = cls.assignes?.find(
    (a) => a.teacherId.toString() === dto.teacherId
  );
  if (!assignment) {
    throw new ForbiddenException("Teacher is not assigned to this class");
  }
  if (!assignment.schedule || assignment.schedule.length === 0) {
    throw new BadRequestException("Teacher has no schedule assigned in this class");
  }

  // 4. ✅ Check the date is today
  const dateObj    = new Date(dto.date);
  const today      = new Date();
  const todayStart = new Date(new Date(today).setHours(0,  0,  0, 0));
  const todayEnd   = new Date(new Date(today).setHours(23, 59, 59, 999));

  if (dateObj.getTime() < todayStart.getTime() || dateObj.getTime() > todayEnd.getTime()) {
    throw new ForbiddenException("You can only mark attendance for today's date");
  }

  // 5. ✅ Check teacher is scheduled on today's day
  const dayNames  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const todayName = dayNames[dateObj.getDay()];

  const scheduledSlot = assignment.schedule.find(
    (s) => s.day.toLowerCase() === todayName.toLowerCase()
  );
  if (!scheduledSlot) {
    throw new ForbiddenException(
      `You are not scheduled to teach on ${todayName}. Cannot mark attendance for this date.`
    );
  }

  // 6. ✅ Check current time is within the lecture window
  const now      = new Date();
  const nowTotal = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = scheduledSlot.startTime.split(":").map(Number);
  const [endH,   endM]   = scheduledSlot.endTime.split(":").map(Number);
  const startTotal = startH * 60 + startM;
  const endTotal   = endH   * 60 + endM;

  if (nowTotal < startTotal || nowTotal > endTotal) {
    throw new ForbiddenException(
      `Attendance can only be marked during lecture hours: ${scheduledSlot.startTime} – ${scheduledSlot.endTime}`
    );
  }

  // 7. Validate all students are enrolled
  const enrolledIds     = new Set(cls.classStudents?.map((id) => id.toString()));
  const invalidStudents = dto.records.filter((r) => !enrolledIds.has(r.studentId));
  if (invalidStudents.length > 0) {
    throw new BadRequestException(
      `These students are not enrolled: ${invalidStudents.map((r) => r.studentId).join(", ")}`
    );
  }

  // 8. Check for duplicate attendance on this date
  const dayStart = new Date(new Date(dateObj).setHours(0,  0,  0, 0));
  const dayEnd   = new Date(new Date(dateObj).setHours(23, 59, 59, 999));

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
        : "Attendance already marked for this class on this date"
    );
  }

  // 9. Bulk insert
  const records = dto.records.map((r) => ({
    classId:          dto.classId,
    studentId:        r.studentId,
    teacherId:        dto.teacherId,
    attendenceStatus: r.attendenceStatus,
    date:             new Date(dto.date),
    lectureNumber:    dto.lectureNumber,
  }));

  await this.attendenceModel.insertMany(records);
  return {
    message: `Attendance marked for ${records.length} students`,
    date:    dto.date,
    classId: dto.classId,
  };
}

  // ── Get attendance for a class on a specific date ─────────
  async getClassAttendenceByDate(classId: string, date: string) {
    const cls = await this.classModel.findById(classId);
    if (!cls) throw new NotFoundException("Class does not exist");

    const dateObj  = new Date(date);
    const dayStart = new Date(new Date(dateObj).setHours(0,  0,  0, 0));
    const dayEnd   = new Date(new Date(dateObj).setHours(23, 59, 59, 999));

    const records = await this.attendenceModel
      .find({ classId, date: { $gte: dayStart, $lte: dayEnd } })
      .populate({ path: "studentId", select: "name lastName specialId" })
      .populate({ path: "teacherId", select: "name lastName" })
      .sort({ lectureNumber: 1 });

    return { date, classId, total: records.length, records };
  }

  // ── Get attendance summary for a student in a class ───────
  async getStudentAttendence(classId: string, studentId: string) {
    const records = await this.attendenceModel.find({ classId, studentId });

    const total   = records.length;
    const present = records.filter((r) => r.attendenceStatus === "P").length;
    const absent  = records.filter((r) => r.attendenceStatus === "A").length;
    const leave   = records.filter((r) => r.attendenceStatus === "L").length;
    const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : "0.0";

    return { classId, studentId, total, present, absent, leave, percentage, records };
  }

  // ── Update attendance record ───────────────────────────────
async updateAttendance(attendanceId,dto: UpdateAttendenceDto) {
  // 1. Validate class
  const cls = await this.classModel.findById(dto.classId);
  if (!cls) throw new NotFoundException("Class does not exist");

  // 2. Validate teacher
  const teacher = await this.userModel.findOne({ _id: dto.teacherId, role: "proff" });
  if (!teacher) throw new NotFoundException("Teacher does not exist");

  // 3. Teacher must be assigned to this class
  const isAssigned = await this.isAssigned(dto.teacherId, dto.classId);
  if (!isAssigned) throw new ForbiddenException("Teacher is not assigned to this class");

  // 4. Student must be enrolled
  const isEnrolled = cls.classStudents?.some((id) => id.toString() === dto.studentId);
  if (!isEnrolled) throw new BadRequestException("Student is not enrolled in this class");

  // 5. Find the attendance record to update
  const record = await this.attendenceModel.findById(attendanceId);
  if (!record) throw new NotFoundException("Attendance record not found");

  // 6. Record must belong to this teacher and class
  if (
    record.teacherId.toString() !== dto.teacherId ||
    record.classId.toString()   !== dto.classId
  ) {
    throw new ForbiddenException("You are not authorized to update this attendance record");
  }

  // 7. ✅ Find this teacher's assignment in the class to get their schedule
  const assignment = cls.assignes?.find(
    (a) => a.teacherId.toString() === dto.teacherId
  );
  if (!assignment || !assignment.schedule || assignment.schedule.length === 0) {
    throw new BadRequestException("Teacher has no schedule assigned in this class");
  }

  // 8. ✅ Get the day name from the attendance record's date
  const recordDate = new Date(record.date);
  const dayNames   = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const recordDay  = dayNames[recordDate.getDay()]; // e.g. "Monday"

  // 9. ✅ Find matching schedule entry for this day
  const scheduledSlot = assignment.schedule.find(
    (s) => s.day.toLowerCase() === recordDay.toLowerCase()
  );
  if (!scheduledSlot) {
    throw new ForbiddenException(
      `You are not scheduled to teach on ${recordDay}. Cannot update attendance for this date.`
    );
  }

  // 10. ✅ Validate current time is within the lecture window
  const now       = new Date();
  const nowHours  = now.getHours();
  const nowMins   = now.getMinutes();
  const nowTotal  = nowHours * 60 + nowMins; // current time in total minutes

  // Parse startTime and endTime (format: "HH:MM")
  const [startH, startM] = scheduledSlot.startTime.split(":").map(Number);
  const [endH,   endM]   = scheduledSlot.endTime.split(":").map(Number);
  const startTotal = startH * 60 + startM;
  const endTotal   = endH   * 60 + endM;

  // 11. ✅ Validate the update is happening on the same date as the record
  const today        = new Date();
  const todayStart   = new Date(today.setHours(0,  0,  0, 0));
  const todayEnd     = new Date(today.setHours(23, 59, 59, 999));
  const recordDateMs = recordDate.getTime();

  if (recordDateMs < todayStart.getTime() || recordDateMs > todayEnd.getTime()) {
    throw new ForbiddenException(
      "You can only update attendance for today's date"
    );
  }

  // 12. ✅ Validate current time is within the scheduled lecture window
  if (nowTotal < startTotal || nowTotal > endTotal) {
    throw new ForbiddenException(
      `Attendance can only be updated during the lecture hours: ${scheduledSlot.startTime} – ${scheduledSlot.endTime}`
    );
  }

  // 13. Update the record
  record.attendenceStatus = dto.attendenceStatus;
  await record.save();

  return {
    message:  "Attendance updated successfully",
    record,
  };
}

  // ── helpers ───────────────────────────────────────────────
  private async isAssigned(teacherId: string, classId: string): Promise<boolean> {
    const assignment = await this.classModel.findOne({
      _id: classId,
      "assignes.teacherId": teacherId,
    });
    return !!assignment;
  }
}