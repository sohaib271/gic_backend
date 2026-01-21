import { Controller,Get,Post,Patch, UseGuards, Body, Param } from '@nestjs/common';
import { HodGuard } from 'src/others-stuff/guards/hod.guard';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { ClassService } from './class.service';
import { CreateClassDto } from './dto/class.dto';
import { AssignedTeacherDto } from './dto/assignes.dto';
import { UpdateClassDto } from './dto/updateClass.dto';

@UseGuards(AuthGuard,HodGuard)
@Controller('class')
export class ClassController {
  constructor(private readonly classservice:ClassService){}

  @Post("create")
  createClass(@Body() dto:CreateClassDto){
    return this.classservice.createClass(dto);
  }

  @Post("add-one-teacher/:id")
  addTeacher(@Param('id') id:string, @Body() dto:AssignedTeacherDto){
    return this.classservice.addOneTeacher(dto,id);
  }

  @Post("add-one-student/:classId/:studentId")
  addStudent(@Param('classId') classId:string, @Param('studentId') studentId:string){
    return this.classservice.addOneStudent(classId,studentId);
  }


  @Patch("remove-student/:classId/:studentId")
  removeStudent(@Param('classId') classId:string,@Param('studentId') studentId:string){
    return this.classservice.removeStudentFromClass(classId,studentId);
  }

  @Patch("remove-teacher/:classId/:teacherId")
  removeTeacher(@Param('classId') classId:string,@Param('teacherId') teacherId:string){
    return this.classservice.removeTeacherFromClass(classId,teacherId);
  }

  @Patch("update-class/:classId")
  updateClass(@Param('classId') classId:string,@Body()dto:UpdateClassDto){
    return this.classservice.updateClassCredentials(classId,dto);
  }
}
