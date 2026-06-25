import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateStudentDto } from './dto/create-user.dto/create-student.dto';
import { CreateProfessorDto } from './dto/create-user.dto/create-professor.dto';
import { CreateStaffDto } from './dto/create-user.dto/create-staff.dto';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { AdminGuard } from 'src/others-stuff/guards/admin.guard';
import { RolesGuard } from 'src/others-stuff/guards/roles.guard';
import { Roles } from 'src/others-stuff/guards/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';

@Controller('users')
@UseGuards(AuthGuard) // All routes require authentication
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('student')
  @UseGuards(RolesGuard)
  @Roles("admin","hod")
  createStudent(@Body() dto: CreateStudentDto) {
    return this.userService.createStudent(dto);
  }

  @Get('me')
  getMe(@Req() req: any) {
    return this.userService.getLoggedInUser(req?.user.sub);
  }

  @Post('professor')
  @UseGuards(RolesGuard)
  @Roles("admin","hod") 
  createProfessor(@Body() dto: CreateProfessorDto) {
    return this.userService.createProfessor(dto);
  }

  @Post('staff')
  @UseGuards(AdminGuard) // Only admin
  createStaff(@Body() dto: CreateStaffDto) {
    return this.userService.createStaff(dto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles("admin","proff")
  getAllUsers(
    @Query('role') role?: string,
    @Query('department') department?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.userService.getAllUsers(role, department, Number(page), Number(limit));
  }

  @Post('students/bulk-upload')
@UseGuards(RolesGuard)
@Roles("admin","hod")
@UseInterceptors(
  FileInterceptor('file', {
    storage: multer.memoryStorage(),
  }),
)
bulkUploadStudents(
  @UploadedFile() file: Express.Multer.File,
) {
  return this.userService.bulkUploadStudents(file);
}

  @Get(':id')
  getUserById(@Param('id') id: string) {
    return this.userService.getUserById(id);
  }

  @Get('student/:studentId/timetable')
  @UseGuards(RolesGuard)
  @Roles('admin', 'student')
  getStudentTimetable(@Param('studentId') studentId: string) {
    return this.userService.getStudentTimetable(studentId);
  }

  @Get('special/:specialId')
  getUserBySpecialId(@Param('specialId') specialId: string) {
    return this.userService.getUserBySpecialId(specialId);
  }

  @Put(':id')
  updateUser(@Param('id') id: string, @Body() updateData: any) {
    return this.userService.updateUser(id, updateData);
  }

  @Delete(':id')
  @UseGuards(AdminGuard) // Only admin
  deleteUser(@Param('id') id: string) {
    return this.userService.deleteUser(id);
  }

  @Get('get-schedule/:teacherId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'proff')
  getTeacherSchedule(
    @Param('teacherId') teacherId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.userService.getTeacherSchedule(teacherId, Number(page), Number(limit));
  }
}
