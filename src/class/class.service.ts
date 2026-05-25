import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Class, ClassDocument } from './schema/class.schema';
import { Model, Types } from 'mongoose';
import { CreateClassDto } from './dto/class.dto';
import { AssignedTeacherDto } from './dto/assignes.dto';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { UpdateClassDto } from './dto/updateClass.dto';
import { StruckOff, StruckOffDocument } from './schema/struckoff.schema';

@Injectable()
export class ClassService {
  constructor(@InjectModel(Class.name)private classModel:Model<ClassDocument>, @InjectModel(User.name)private userModel:Model<UserDocument>, @InjectModel(StruckOff.name)private struckOffModel:Model<StruckOffDocument>){}


  // ✅ Parse date safely as UTC calendar date
parseDateToUTCRange(dateStr: string): {
  dayStart: Date;
  dayEnd: Date;
  dayName: string;
} {
  const [year, month, day] = dateStr.split('-').map(Number);

  const dayStart = new Date(
    Date.UTC(year, month - 1, day, 0, 0, 0, 0),
  );

  const dayEnd = new Date(
    Date.UTC(year, month - 1, day, 23, 59, 59, 999),
  );

  const dayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  const dayName = dayNames[dayStart.getUTCDay()];

  return { dayStart, dayEnd, dayName };
}

// ✅ Current time in PKT (UTC+5)
getNowInPKT(): { nowTotal: number; pktTodayStr: string } {
  const now = new Date();

  const utcMinutes =
    now.getUTCHours() * 60 + now.getUTCMinutes();

  const pktOffset = 5 * 60;

  const pktMinutes =
    (utcMinutes + pktOffset) % (24 * 60);

  const pktNow = new Date(
    now.getTime() + 5 * 60 * 60 * 1000,
  );

  return {
    nowTotal: pktMinutes,
    pktTodayStr: pktNow.toISOString().split('T')[0],
  };
}

  async getClasses(category?:string){
    let filter = category ? { category } : {};
    const classes=await this.classModel.find(filter).lean().populate({path:"classStudents",select:"-password -createdAt -updatedAt -verifyToken -isHod -isQrScanned -_v -isPrincipal -role -otp -otpExpiry -image -cnic -address -phone -__v -matricMarks"}).populate({
    path: "departmentId", select:"code _id category"
  }).populate({path:"assignes.teacherId",select:"name"});
    if(classes.length==0){
      return "No Class created";
    }

    return classes;
  }

  async getMyClasses(teacherId){
       const classes=await this.classModel.find({"assignes.teacherId": teacherId}).lean().populate({path:"classStudents",select:"-password -createdAt -updatedAt -verifyToken -isHod -isQrScanned -_v -isPrincipal -role"}).populate({
    path: "departmentId",
  }).populate({path:"assignes.teacherId",select:"name"});
    if(classes.length==0){
      return "No Class created";
    }

    return classes;
  }

  
  async createClass(dto: CreateClassDto, createdBy: string) {
  try {
    const isExist = await this.classModel.exists({ className: dto.className });
    if (isExist) throw new ConflictException('Class of similar name already exists.');

    const newClass = new this.classModel({
      ...dto,
      createdBy,
    });

    await newClass.save();
    return { message: 'Class created successfully', newClass };

  } catch (error) {
    if (error instanceof ConflictException) throw error;

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e: any) => e.message);
      throw new BadRequestException({ message: 'Validation failed', errors: messages });
    }

    throw new InternalServerErrorException('Something went wrong');
  }
}

async getClassInfo(classId:string){
  const isExist=await this.classModel.findById(classId).lean().populate("departmentId").populate({
    path: "assignes.teacherId",
    select: "name" // only fetch firstName
  });
  if(!isExist){
    throw new NotFoundException("Class doesn't exist");
  }

  return {
    isExist
  }
}

async getClassStudentList(classId:string){
  const isExist=await this.classModel.findById(classId,{classStudents:1}).lean().populate({path:"classStudents",select:"-password -createdAt -updatedAt -verifyToken -isHod -isQrScanned -_v -isPrincipal -role"});

  if(!isExist){
    throw new NotFoundException("Class doesn't exist");
  }

  const classStudents=isExist?.classStudents;
  if(classStudents?.length===0){
    throw new BadRequestException("Class has no students.")
  }

  return {
    classStudents
  }
}

async getAssignedTeacherList(classId:string){
  const isExist=await this.classModel.findById(classId,{assignes:1}).lean();
  if(!isExist){
    throw new NotFoundException('Class doesnt exist');
  }

  const assignedTeachers=isExist?.assignes;

  if(assignedTeachers?.length===0){
    throw new BadRequestException('Class has no teachers assigned.');
  }

  return {
    assignedTeachers
  }
}



  async addTeacherInClass(dto: AssignedTeacherDto, classId: string) {
  const classTeachers = await this.checkTeachers(classId, dto.teacherId);
  const isExistInClass = classTeachers?.find(
    (teacher) =>
      teacher.teacherId.toString() === dto.teacherId ||
      teacher.subject === dto.subject
  );

  if (isExistInClass) {
    throw new ConflictException("Teacher already exists");
  }

  await this.classModel.findByIdAndUpdate(
    { _id: classId },
    {
      $push: {
        assignes: {
          teacherId: dto.teacherId,
          subject:   dto.subject,
          schedule:  dto.schedule ?? [],
        },
      },
    },
    { new: true }
  );

  return { message: "Teacher assigned successfully" };
}

async updateTeacherSchedule(classId: string, teacherId: string, schedule: { day: string; startTime: string; endTime: string }[]) {
  const classTeachers = await this.checkTeachers(classId, teacherId);
  
  const teacherIndex = classTeachers?.findIndex(
    (t) => t.teacherId.toString() === teacherId
  );

  if (teacherIndex === -1 || teacherIndex === undefined) {
    throw new NotFoundException("Teacher is not assigned to this class");
  }

  if (!schedule || schedule.length === 0) {
    throw new BadRequestException("Schedule cannot be empty");
  }

  // ✅ Update schedule of the specific teacher using positional operator
  await this.classModel.findByIdAndUpdate(
    classId,
    {
      $set: {
        [`assignes.${teacherIndex}.schedule`]: schedule,
      },
    },
    { new: true }
  );

  return { message: "Schedule updated successfully" };
}

async addTeacherSchedule(
  classId: string,
  teacherId: string,
  schedule: { day: string; startTime: string; endTime: string }[]
) {
  const classTeachers = await this.checkTeachers(classId, teacherId);

  // ✅ Guard against undefined
  if (!classTeachers || classTeachers.length === 0) {
    throw new NotFoundException("No teachers assigned to this class");
  }

  const teacherIndex = classTeachers.findIndex(
    (t) => t.teacherId.toString() === teacherId
  );

  if (teacherIndex === -1) {
    throw new NotFoundException("Teacher is not assigned to this class");
  }

  if (!schedule || schedule.length === 0) {
    throw new BadRequestException("Schedule cannot be empty");
  }

  const existingDays = classTeachers[teacherIndex].schedule?.map((s) => s.day) ?? [];
  const duplicates   = schedule.filter((s) => existingDays.includes(s.day));

  if (duplicates.length > 0) {
    throw new ConflictException(
      `Schedule already exists for: ${duplicates.map((d) => d.day).join(", ")}`
    );
  }

  await this.classModel.findByIdAndUpdate(
    classId,
    {
      $push: {
        [`assignes.${teacherIndex}.schedule`]: { $each: schedule },
      },
    },
    { new: true }
  );

  return { message: "Schedule entries added successfully" };
}

  async addStudentInClass(classId:string,studentId:string){
    const allStudents=await this.checkStudents(classId,studentId);
    const isExists=allStudents?.find(student=>student.toString()===studentId);
    if(isExists){
      throw new ConflictException("Student already exists");
    }

    await this.classModel.findByIdAndUpdate(classId,{$addToSet:{classStudents:studentId}},{new:false});

    return {
      message:"Student added successfully"
    }
  }

  async removeStudentFromClass(classId:string,studentId:string){
    const allStudents=await this.checkStudents(classId,studentId);
    const isExists=allStudents?.find(student=>student.toString()===studentId);
    if(!isExists){
      throw new ConflictException("Student doesn't exist");
    }
    await this.classModel.findByIdAndUpdate(classId,{$pull:{classStudents:isExists}},{new:false});

    return {
      message:"Student has been removed from class",
    }
  }

  async struckOffStudent(classId: string, studentId: string, actionBy: string, dto: any) {
  try {
    this.validateObjectId(classId, 'Invalid class ID');
    this.validateObjectId(studentId, 'Invalid student ID');
    this.validateObjectId(actionBy, 'Invalid action user ID');

    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('Reason is required');
    }

    let classObjectId = new Types.ObjectId(classId);
    let studentObjectId = new Types.ObjectId(studentId);

    // 1. Fetch and validate existing data in parallel
    let [student, cls, existingRecord] = await Promise.all([
      this.userModel.exists({ _id: studentObjectId, role: 'student' }),
      this.classModel.findById(classObjectId, { classStudents: 1 }).lean(),
      this.struckOffModel.findOne({ studentId: studentObjectId }).lean(),
    ]);

    // Be tolerant of clients accidentally sending /:studentId/:classId.
    if (!student || !cls) {
      const [swappedStudent, swappedClass, swappedRecord] = await Promise.all([
        this.userModel.exists({ _id: classObjectId, role: 'student' }),
        this.classModel.findById(studentObjectId, { classStudents: 1 }).lean(),
        this.struckOffModel.findOne({ studentId: classObjectId }).lean(),
      ]);

      if (swappedStudent && swappedClass) {
        [classId, studentId] = [studentId, classId];
        [classObjectId, studentObjectId] = [studentObjectId, classObjectId];
        [student, cls, existingRecord] = [swappedStudent, swappedClass, swappedRecord];
      }
    }

    if (!student) {
      throw new UnauthorizedException('Invalid Student');
    }

    if (!cls) {
      throw new NotFoundException("Class doesn't exist");
    }

    if (existingRecord?.currentStatus?.status === 'struck_off') {
      throw new ConflictException('Student is already struck off');
    }

    const isEnrolled = cls.classStudents?.some((id) => id.toString() === studentObjectId.toString());
    if (!isEnrolled) {
      throw new ConflictException("Student doesn't exist in this class");
    }

    // 2. Prepare the log data structure
    const statusLog = {
      status: 'struck_off',
      reason: dto.reason.trim(),
     start: dto.start
  ? this.parseDateToUTCRange(dto.start).dayStart
  : new Date(), // Ensures valid date format
      end: dto.end
  ? this.parseDateToUTCRange(dto.end).dayEnd
  : null,
      actionBy: new Types.ObjectId(actionBy),
    };

    // 3. Update struck-off status without removing the student from the class
    const [struckOffRecord] = await Promise.all([
      this.struckOffModel.findOneAndUpdate(
        { studentId: studentObjectId },
        {
          $set: { currentStatus: statusLog },
          $push: { history: statusLog },
          $setOnInsert: { studentId: studentObjectId },
        },
        { new: true, upsert: true, runValidators: true },
      ).populate({ 
        path: 'studentId', 
        select: 'name lastName specialId email rollNo class session category department' 
      }),

      this.userModel.findByIdAndUpdate(
        studentObjectId,
        { $set: { struckOff: true } }
      ),
    ]);

    return {
      message: 'Student has been struck off successfully',
      struckOffRecord,
    };
  } catch (error) {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof NotFoundException ||
      error instanceof UnauthorizedException
    ) {
      throw error;
    }

    if (error?.code === 11000) {
      throw new ConflictException('Student struck off record already exists');
    }

    if (error?.name === 'CastError') {
      throw new BadRequestException('Invalid ID provided');
    }

    throw new InternalServerErrorException('Unable to struck off student');
  }
}


  async identifyStruckOffStudent(studentId:string){
    try {
      this.validateObjectId(studentId, 'Invalid student ID');

      const student = await this.findStudent(studentId);
      if (!student) {
        throw new UnauthorizedException('Invalid Student');
      }

      const struckOffRecord = await this.struckOffModel
        .findOne({studentId:student})
        .lean()
        .populate({ path: 'studentId', select: 'name lastName specialId email rollNo class session category department' })
        .populate({ path: 'currentStatus.actionBy', select: 'name lastName specialId role' });
      return {
        isStruckOff: Boolean(struckOffRecord),
        struckOffRecord,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }

      if (error?.name === 'CastError') {
        throw new BadRequestException('Invalid ID provided');
      }

      throw new InternalServerErrorException('Unable to identify struck off student');
    }
  }

  async unStruckOffStudent(studentId: string, actionBy: string, reason: string) {
  try {
    this.validateObjectId(studentId, 'Invalid student ID');
    this.validateObjectId(actionBy,  'Invalid action user ID');

    if (!reason?.trim()) {
      throw new BadRequestException('Reason is required for reinstating a student');
    }

    const studentObjectId = new Types.ObjectId(studentId);
    const actionByObjectId = new Types.ObjectId(actionBy);

    // ✅ Fetch student and existing struck off record in parallel
    const [student, existingRecord] = await Promise.all([
      this.userModel.exists({ _id: studentObjectId, role: 'student' }),
      this.struckOffModel.findOne({ studentId: studentObjectId }).lean(),
    ]);

    if (!student) {
      throw new UnauthorizedException('Invalid Student');
    }

    if (!existingRecord) {
      throw new NotFoundException('No struck off record found for this student');
    }

    if (existingRecord.currentStatus?.status !== 'struck_off') {
      throw new ConflictException('Student is not currently struck off');
    }

    const now = new Date();

    // ✅ Reinstatement log — record the end date on history entry and clear currentStatus
    const reinstateLog = {
      status:   'reinstated',
      reason:   reason.trim(),
      start:    null,  // ✅ cleared
      end:      null,  // ✅ cleared
      actionBy: actionByObjectId,
    };

    const [updatedRecord] = await Promise.all([
      this.struckOffModel.findOneAndUpdate(
        { studentId: studentObjectId },
        {
          $set:  { currentStatus: null },
          $push: { history: reinstateLog },
        },
        { new: true },
      ).populate({
        path:   'studentId',
        select: 'name lastName specialId email rollNo class session category department',
      }),

      this.userModel.findByIdAndUpdate(
        studentObjectId,
        { $set: { struckOff: false } },
      ),
    ]);

    return {
      message:       'Student has been reinstated successfully',
      updatedRecord,
    };

  } catch (error) {
    if (
      error instanceof BadRequestException  ||
      error instanceof ConflictException    ||
      error instanceof NotFoundException    ||
      error instanceof UnauthorizedException
    ) {
      throw error;
    }

    if (error?.name === 'CastError') {
      throw new BadRequestException('Invalid ID provided');
    }

    throw new InternalServerErrorException('Unable to reinstate student');
  }
}

  async getStruckOffStudents(){
    try {
      const struckOffStudents = await this.struckOffModel
        .find({ 'currentStatus.status': 'struck_off' })
        .lean()
        .populate({ path: 'studentId', select: 'name lastName specialId email rollNo class session category department' })
        .populate({ path: 'currentStatus.actionBy', select: 'name lastName specialId role' });

      return {
        count: struckOffStudents.length,
        struckOffStudents,
      };
    } catch (error) {
      if (error?.name === 'CastError') {
        throw new BadRequestException('Invalid ID provided');
      }

      throw new InternalServerErrorException('Unable to get struck off students');
    }
  }


  async removeTeacherFromClass(classId:string,teacherId:string){
    const classTeachers=await this.checkTeachers(classId,teacherId);
    const isExistInClass=classTeachers?.find(teacher => teacher.teacherId.toString()===teacherId);
    
    if(!isExistInClass){
      throw new ConflictException("Teacher doesn't exist in class");
    }

    await this.classModel.findByIdAndUpdate(classId,{$pull:{assignes:{teacherId}}},{new:false});

    return {
      message:"Teacher removed",
    }
  }
  async updateAssignedTeacher(classId: string, teacherId: string, dto: Partial<AssignedTeacherDto>) {
  const cls = await this.classModel.findById(classId);
  if (!cls) throw new NotFoundException("Class not found");

  const index = cls.assignes?.findIndex(
    (a) => a.teacherId.toString() === teacherId
  );
  if (index === -1 || index === undefined) {
    throw new NotFoundException("Teacher not assigned to this class");
    
  }
  if (!cls.assignes || cls.assignes.length === 0) {
  throw new NotFoundException("No teachers assigned to this class");
}

  if (dto.subject)  cls.assignes[index].subject  = dto.subject;
  if (dto.schedule) cls.assignes[index].schedule = dto.schedule;

  cls.markModified("assignes"); // ✅ required for nested array updates
  await cls.save();
  return { message: "Assignment updated successfully", class: cls };
}

  async updateClassCredentials(classId:string,dto:UpdateClassDto){
      const updateData:any={};
      if(dto?.class!==undefined) updateData.class=dto.class;
      if(dto?.session!==undefined) updateData.session=dto.session;

      if(Object.keys(updateData).length===0){
        throw new BadRequestException("Empty fields provided");
      }

      await this.classModel.findByIdAndUpdate(classId,{$set:updateData},{new:false});

      return {
        message:"Updated"
      }
  }

  async checkTeachers(classId:string,teacherId:string){
    const [isExist, teachers] = await Promise.all([
      this.findTeacher(teacherId),
      this.classModel.findById(classId,{assignes:1,_id:0}).lean(),
    ]);
    if(!isExist){
      throw new UnauthorizedException("Invalid Teacher");
    }
    return teachers?.assignes;
  }

  async checkStudents(classId:string,studentId:string){
    const [isExist, cls] = await Promise.all([
      this.findStudent(studentId),
      this.classModel.findById(classId,{classStudents:1,_id:0}).lean(),
    ]);
     if(!isExist){
      throw new UnauthorizedException("Invalid Student");
    }
    return cls?.classStudents;
  }
  private async findTeacher(id:string){
    const teacher=await this.userModel.exists({_id:id,role:'proff'});
    return teacher?._id ?? null;
  }

  private async findStudent(id:string){
    const student=await this.userModel.exists({_id:id,role:'student'});
    return student?._id ?? null;
  }

  private validateObjectId(id:string, message:string){
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(message);
    }
  }
}
