import { Controller,Get,Post,Patch, UseGuards, Body, Param, Req, Query } from '@nestjs/common';
import { HodGuard } from 'src/others-stuff/guards/hod.guard';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { ClassService } from './class.service';
import { CreateClassDto } from './dto/class.dto';
import { AssignedTeacherDto, UpdateScheduleDto } from './dto/assignes.dto';
import { UpdateClassDto } from './dto/updateClass.dto';
import { AdminGuard } from 'src/others-stuff/guards/admin.guard';

@UseGuards(AuthGuard)
@Controller('class')
export class ClassController {
  constructor(private readonly classservice:ClassService){}


  // @UseGuards(HodGuard)
  @UseGuards(AdminGuard)
  @Post("create")
  createClass(@Req() req:any,@Body() dto:CreateClassDto){
    return this.classservice.createClass(dto,req.user.sub);
  }

  @UseGuards(AdminGuard)
  @Post("assign-teacher-to-class/:id")
  addTeacher(@Param('id') id:string, @Body() dto:AssignedTeacherDto){
    return this.classservice.addTeacherInClass(dto,id);
  }

  @UseGuards(HodGuard)
  @Post("add-student-in-class/:classId/:studentId")
  addStudent(@Param('classId') classId:string, @Param('studentId') studentId:string){
    return this.classservice.addStudentInClass(classId,studentId);
  }

  @UseGuards(AdminGuard)
  @Get('all')
  getClasses(@Query('category') category?: string){
    return this.classservice.getClasses(category);
  }

  // class.controller.ts

@Patch(':id/assignes/:teacherId/schedule')
@UseGuards(AdminGuard)
updateTeacherSchedule(
  @Param('id') classId: string,
  @Param('teacherId') teacherId: string,
  @Body() dto: UpdateScheduleDto,
) {
  return this.classservice.updateTeacherSchedule(classId, teacherId, dto.schedule);
}

// POST /classes/:id/assignes/:teacherId/schedule
@Post(':id/assignes/:teacherId/schedule')
@UseGuards(AdminGuard)
addTeacherSchedule(
  @Param('id') classId: string,
  @Param('teacherId') teacherId: string,
  @Body() dto: UpdateScheduleDto,
) {
  return this.classservice.addTeacherSchedule(classId, teacherId, dto.schedule);
}

@UseGuards(AdminGuard)
  @Patch("remove-student-from-class/:classId/:studentId")
  removeStudent(@Param('classId') classId:string,@Param('studentId') studentId:string){
    return this.classservice.removeStudentFromClass(classId,studentId);
  }

   @Patch(":id/assignes/:teacherId")
  @UseGuards(AdminGuard)
  updateAssignedTeacher(
    @Param("id") id: string,
    @Param("teacherId") teacherId: string,
    @Body() dto: Partial<AssignedTeacherDto>
  ) {
    return this.classservice.updateAssignedTeacher(id, teacherId, dto);
  }

  @UseGuards(AdminGuard)
  @Patch("remove-teacher-from-class/:classId/:teacherId")
  removeTeacher(@Param('classId') classId:string,@Param('teacherId') teacherId:string){
    return this.classservice.removeTeacherFromClass(classId,teacherId);
  }

  @UseGuards(AdminGuard)
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
