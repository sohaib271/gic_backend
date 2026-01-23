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

  async createClass(dto:CreateClassDto){
    const isExist=await this.classModel.findOne({className:dto.className});

    if(isExist){
      throw new ConflictException("Class of similar name already exists.")
    }

    const newClass=new this.classModel(dto);
    await newClass.save();

    return {
      message:"Class created successflly",
      newClass
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

  async addTeacherInClass(dto:AssignedTeacherDto,classId:string){
    const classTeachers=await this.checkTeachers(classId,dto.teacherId);
    const isExistInClass=classTeachers?.find(teacher => teacher.teacherId.toString()===dto.teacherId || teacher.subject===dto.subject);
    
    if(isExistInClass){
      throw new ConflictException("Teacher already exists");
    }

   

    await this.classModel.findByIdAndUpdate({_id:classId},{$push:{assignes:{teacherId:dto.teacherId,name:dto.name,subject:dto.subject}}},{new:true});

    return {
      message:`Teacher assigned successfully`,
    }
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

  async updateClassCredentials(classId:string,dto:UpdateClassDto){
      const updateData:any={};
      if(dto?.inter!==undefined) updateData.inter=dto.inter;
      if(dto?.semester!==undefined) updateData.semester=dto.semester;
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
