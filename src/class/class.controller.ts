import { Controller,Get,Post,Patch, UseGuards, Body, Param } from '@nestjs/common';
import { HodGuard } from 'src/others-stuff/guards/hod.guard';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { ClassService } from './class.service';
import { CreateClassDto } from './dto/class.dto';
import { AssignedTeacherDto } from './dto/assignes.dto';

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


}
