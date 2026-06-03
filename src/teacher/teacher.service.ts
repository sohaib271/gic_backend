import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Class, ClassDocument } from 'src/class/schema/class.schema';
import { User, UserDocument } from 'src/user/schema/user.schema';

@Injectable()
export class TeacherService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Class.name) private readonly classModel: Model<ClassDocument>,
  ) {}

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
