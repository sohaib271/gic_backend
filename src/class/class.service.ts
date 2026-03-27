import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Class, ClassDocument } from './schema/class.schema';
import { Model } from 'mongoose';
import { CreateClassDto } from './dto/class.dto';
import { AssignedTeacherDto } from './dto/assignes.dto';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { UpdateClassDto } from './dto/updateClass.dto';

@Injectable()
export class ClassService {
  constructor(@InjectModel(Class.name)private classModel:Model<ClassDocument>, @InjectModel(User.name)private userModel:Model<UserDocument>){}

  async getClasses(category?:string){
    const filter = category ? { category } : {};
    const classes=await this.classModel.find(filter).populate({path:"classStudents",select:"-password -createdAt -updatedAt -verifyToken -isHod -isQrScanned -_v -isPrincipal -role"}).populate({
    path: "departmentId",
  });;
    if(classes.length==0){
      return "No Class created";
    }

    return classes;
  }
  async createClass(dto: CreateClassDto, createdBy: string) {
  try {
    const isExist = await this.classModel.findOne({ className: dto.className });
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
  const isExist=await this.classModel.findById({_id:classId}).populate("departmentId");

  if(!isExist){
    throw new NotFoundException("Class doesn't exist");
  }

  return {
    isExist
  }
}

async getClassStudentList(classId:string){
  const isExist=await this.classModel.findById({_id:classId},{classStudents:1}).populate({path:"classStudents",select:"-password -createdAt -updatedAt -verifyToken -isHod -isQrScanned -_v -isPrincipal -role"});

  if(!isExist){
    throw new NotFoundException("Class doesn't exist");
  }

  const classStudents=isExist?.classStudents;
  if(classStudents.length===0){
    throw new BadRequestException("Class has no students.")
  }

  return {
    classStudents
  }
}

async getAssignedTeacherList(classId:string){
  const isExist=await this.classModel.findById({_id:classId},{assignes:1});

  if(!isExist){
    throw new NotFoundException('Class doesnt exist');
  }

  const assignedTeachers=isExist?.assignes;

  if(assignedTeachers.length===0){
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
          schedule:  dto.schedule ?? [],  // ✅ include schedule
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

    await this.classModel.findByIdAndUpdate({_id:classId},{$addToSet:{classStudents:studentId}},{new:true});

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
    await this.classModel.findByIdAndUpdate({_id:classId},{$pull:{classStudents:isExists}});

    return {
      message:"Student has been removed from class",
    }
  }


  async removeTeacherFromClass(classId:string,teacherId:string){
    const classTeachers=await this.checkTeachers(classId,teacherId);
    const isExistInClass=classTeachers?.find(teacher => teacher.teacherId.toString()===teacherId);
    
    if(!isExistInClass){
      throw new ConflictException("Teacher doesn't exist in class");
    }

    await this.classModel.findByIdAndUpdate({_id:classId},{$pull:{assignes:{teacherId}}});

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

      await this.classModel.findByIdAndUpdate({_id:classId},{$set:updateData},{new:true});

      return {
        message:"Updated"
      }
  }

  async checkTeachers(classId:string,teacherId:string){
    const isExist=await this.findTeacher(teacherId);

    if(!isExist){
      throw new UnauthorizedException("Invalid Teacher");
    }
    const teachers=await this.classModel.findById({_id:classId},{assignes:1,_id:0});
    return teachers?.assignes;
  }

  async checkStudents(classId:string,studentId:string){
    const isExist=await this.findStudent(studentId);
     if(!isExist){
      throw new UnauthorizedException("Invalid Student");
    }
    const classStudents=await this.classModel.findById({_id:classId},{classStudents:1,_id:0});
    return classStudents?.classStudents;
  }
  private async findTeacher(id:string){
    const teacher=await this.userModel.findOne({_id:id,role:'proff'},{_id:1});
    return teacher?._id;
  }

  private async findStudent(id:string){
    const student=await this.userModel.findOne({_id:id,role:'student'},{_id:1});
    return student?._id;
  }
}
