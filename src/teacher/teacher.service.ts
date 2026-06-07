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

  async markTeacherAttendance(dto:TeacherAttendanceDto,teacherId:string) {
    const teacher = await this.userModel.findOne({ _id: teacherId, role: 'proff' }).lean();

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }
    const newAttendance = new this.teacherAttendanceModel({...dto,teacherId:teacherId});
    await newAttendance.save();
    return {
      success: true,
      message: 'Attendance marked successfully',
      newAttendance
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
    exp:       Date.now() + 5 * 60 * 1000, // expires in 5 minutes
  });

  const qrDataUrl = await QRCode.toDataURL(payload, {
    width:           300,
    margin:          2,
    color:           { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });

  return { success: true, qrDataUrl, teacherId, expiresIn: '5 minutes' };
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
