import { Controller,Get,Post,Patch, UseGuards, Body, Param, Req, Query } from '@nestjs/common';
import { HodGuard } from 'src/others-stuff/guards/hod.guard';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { ClassService } from './class.service';
import { CreateClassDto } from './dto/class.dto';
import { AssignedTeacherDto, UpdateScheduleDto } from './dto/assignes.dto';
import { UpdateClassDto } from './dto/updateClass.dto';
import { RolesGuard } from 'src/others-stuff/guards/roles.guard';
import { Roles } from 'src/others-stuff/guards/roles.decorator';
import { StruckOffStudentDto, UnStruckOffStudentDto } from './dto/struckoff.dto';

@UseGuards(AuthGuard)
@Controller('class')
export class ClassController {
  constructor(private readonly classservice:ClassService){}

  @UseGuards(RolesGuard)
  @Roles("admin","hod")
  @Post("create")
  createClass(@Req() req:any,@Body() dto:CreateClassDto){
    return this.classservice.createClass(dto,req.user.sub);
  }

  @UseGuards(RolesGuard)
  @Roles("admin","hod")
  @Post("assign-teacher-to-class/:id")
  addTeacher(@Param('id') id:string, @Body() dto:AssignedTeacherDto){
    return this.classservice.addTeacherInClass(dto,id);
  }

  @UseGuards(RolesGuard)
  @Roles("admin","hod")
  @Post("add-student-in-class/:classId/:studentId")
  addStudent(@Param('classId') classId:string, @Param('studentId') studentId:string){
    return this.classservice.addStudentInClass(classId,studentId);
  }

  @UseGuards(RolesGuard)
  @Roles("admin","hod")
  @Get('all')
  getClasses(@Query('category') category?: string){
    return this.classservice.getClasses(category);
  }
@Patch(':id/assignes/:teacherId/schedule')
@UseGuards(RolesGuard)
@Roles("admin","hod")
updateTeacherSchedule(
  @Param('id') classId: string,
  @Param('teacherId') teacherId: string,
  @Body() dto: UpdateScheduleDto,
) {
  return this.classservice.updateTeacherSchedule(classId, teacherId, dto.schedule);
}

@Get("/my-classes")
@UseGuards(RolesGuard)
@Roles("proff")
getMyClasses(@Req() req:any){
  return this.classservice.getMyClasses(req?.user.sub);
}

// POST /classes/:id/assignes/:teacherId/schedule
@Post(':id/assignes/:teacherId/schedule')
@UseGuards(RolesGuard)
@Roles("admin","hod")
addTeacherSchedule(
  @Param('id') classId: string,
  @Param('teacherId') teacherId: string,
  @Body() dto: UpdateScheduleDto,
) {
  return this.classservice.addTeacherSchedule(classId, teacherId, dto.schedule);
}

  @UseGuards(RolesGuard)
  @Roles("admin","hod")
  @Patch("remove-student-from-class/:classId/:studentId")
  removeStudent(@Param('classId') classId:string,@Param('studentId') studentId:string){
    return this.classservice.removeStudentFromClass(classId,studentId);
  }

  @UseGuards(RolesGuard)
  @Roles("admin","proff")
  @Post("struck-off-student/:classId/:studentId")
  struckOffStudent(
    @Param('classId') classId:string,
    @Param('studentId') studentId:string,
    @Body() dto:StruckOffStudentDto,
    @Req() req:any,
  ){
    return this.classservice.struckOffStudent(classId, studentId, req.user.sub, dto);
  }

   @Patch(":id/assignes/:teacherId")
  @UseGuards(RolesGuard)
  @Roles("admin","hod")
  updateAssignedTeacher(
    @Param("id") id: string,
    @Param("teacherId") teacherId: string,
    @Body() dto: Partial<AssignedTeacherDto>
  ) {
    return this.classservice.updateAssignedTeacher(id, teacherId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("admin","hod")
  @Patch("remove-teacher-from-class/:classId/:teacherId")
  removeTeacher(@Param('classId') classId:string,@Param('teacherId') teacherId:string){
    return this.classservice.removeTeacherFromClass(classId,teacherId);
  }

  @UseGuards(RolesGuard)
  @Roles("admin","hod")
  @Patch("update-class/:classId")
  updateClass(@Param('classId') classId:string,@Body()dto:UpdateClassDto){
    return this.classservice.updateClassCredentials(classId,dto);
  }

 @UseGuards(RolesGuard)
  @Roles("admin","proff") 
  @Get("get-class-info/:classId")
  getClassInfo(@Param('classId') classId:string){
    return this.classservice.getClassInfo(classId);
  }

  @UseGuards(RolesGuard)
  @Roles("admin","hod")
  @Get('get-class-students/:classId')
  getClassStudents(@Param('classId') classId:string){
    return this.classservice.getClassStudentList(classId);
  }

  @UseGuards(RolesGuard)
  @Roles("admin","hod")
  @Get('get-assigned-teachers/:classId')
  getAssignedTeachers(@Param('classId') classId:string){
    return this.classservice.getAssignedTeacherList(classId);
  }

  @UseGuards(RolesGuard)
  @Roles("admin","hod","proff")
  @Get('struck-off-students')
  getStruckOffStudents(){
    return this.classservice.getStruckOffStudents();
  }

 @UseGuards(RolesGuard)
 @Roles("admin", "hod","proff")
 @Patch("unstruck-off-student/:studentId")
 unStruckOffStudent(
  @Param('studentId') studentId: string,
  @Body() dto: UnStruckOffStudentDto,
  @Req() req: any,
 ) {
  return this.classservice.unStruckOffStudent(studentId, req.user.sub, dto.reason);
 }

  @UseGuards(RolesGuard)
  @Roles("admin","hod","proff")
  @Get('identify-struck-off-student/:studentId')
  identifyStruckOffStudent(@Param('studentId') studentId:string){
    return this.classservice.identifyStruckOffStudent(studentId);
  }
}
