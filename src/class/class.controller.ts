import { Controller,Get,Post,Patch, UseGuards, Body, Param } from '@nestjs/common';
import { HodGuard } from 'src/others-stuff/guards/hod.guard';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { ClassService } from './class.service';
import { CreateClassDto } from './dto/class.dto';
import { AssignedTeacherDto } from './dto/assignes.dto';
import { UpdateClassDto } from './dto/updateClass.dto';

@UseGuards(AuthGuard)
@Controller('class')
export class ClassController {
  constructor(private readonly classservice:ClassService){}


  @UseGuards(HodGuard)
  @Post("create")
  createClass(@Body() dto:CreateClassDto){
    return this.classservice.createClass(dto);
  }

  @UseGuards(HodGuard)
  @Post("assign-teacher-to-class/:id")
  addTeacher(@Param('id') id:string, @Body() dto:AssignedTeacherDto){
    return this.classservice.addTeacherInClass(dto,id);
  }

  @UseGuards(HodGuard)
  @Post("add-student-in-class/:classId/:studentId")
  addStudent(@Param('classId') classId:string, @Param('studentId') studentId:string){
    return this.classservice.addStudentInClass(classId,studentId);
  }

@UseGuards(HodGuard)
  @Patch("remove-student-from-class/:classId/:studentId")
  removeStudent(@Param('classId') classId:string,@Param('studentId') studentId:string){
    return this.classservice.removeStudentFromClass(classId,studentId);
  }

  @UseGuards(HodGuard)
  @Patch("remove-teacher-from-class/:classId/:teacherId")
  removeTeacher(@Param('classId') classId:string,@Param('teacherId') teacherId:string){
    return this.classservice.removeTeacherFromClass(classId,teacherId);
  }

  @UseGuards(HodGuard)
  @Patch("update-class/:classId")
  updateClass(@Param('classId') classId:string,@Body()dto:UpdateClassDto){
    return this.classservice.updateClassCredentials(classId,dto);
  }

  @Get("get-class-info/:classId")
  getClassInfo(@Param('classId') classId:string){
    return this.classservice.getClassInfo(classId);
  }

  @Get('get-class-students/:classId')
  getClassStudents(@Param('classId') classId:string){
    return this.classservice.getClassStudentList(classId);
  }

  @Get('get-assigned-teachers/:classId')
  getAssignedTeachers(@Param('classId') classId:string){
    return this.classservice.getAssignedTeacherList(classId);
  }
}
