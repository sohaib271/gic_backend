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
import { BulkAttendenceDto, CreateAttendenceDto } from "./dto/attendence.dto";

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
    const isAssigned = await this.isAssigned(dto.teacherId, dto.classId);
    if (!isAssigned) {
      throw new ForbiddenException("Teacher is not assigned to this class");
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

  // ── Mark attendance for entire class in one request ───────
  async markBulkAttendence(dto: BulkAttendenceDto) {
    // 1. Validate class
    const cls = await this.classModel.findById(dto.classId);
    if (!cls) throw new NotFoundException("Class does not exist");

    // 2. Validate teacher
    const teacher = await this.userModel.findOne({ _id: dto.teacherId, role: "proff" });
    if (!teacher) throw new NotFoundException("Teacher does not exist");

    // 3. Teacher must be assigned
    const isAssigned = await this.isAssigned(dto.teacherId, dto.classId);
    if (!isAssigned) {
      throw new ForbiddenException("Teacher is not assigned to this class");
    }

    // 4. Validate all students are enrolled
    const enrolledIds = new Set(cls.classStudents?.map((id) => id.toString()));
    const invalidStudents = dto.records.filter(
      (r) => !enrolledIds.has(r.studentId)
    );
    if (invalidStudents.length > 0) {
      throw new BadRequestException(
        `These students are not enrolled in this class: ${invalidStudents.map((r) => r.studentId).join(", ")}`
      );
    }

    // 5. Check for duplicate attendance on this date
    const dateObj  = new Date(dto.date);
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

    // 6. Bulk insert
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

  // ── helpers ───────────────────────────────────────────────
  private async isAssigned(teacherId: string, classId: string): Promise<boolean> {
    const assignment = await this.classModel.findOne({
      _id: classId,
      "assignes.teacherId": teacherId,
    });
    return !!assignment;
  }
}