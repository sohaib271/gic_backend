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
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateStudentDto } from './dto/create-user.dto/create-student.dto';
import { CreateProfessorDto } from './dto/create-user.dto/create-professor.dto';
import { CreateStaffDto } from './dto/create-user.dto/create-staff.dto';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { AdminGuard } from 'src/others-stuff/guards/admin.guard';
import { seed } from 'src/others-stuff/seeder/admin.seeder';

@Controller('users')
@UseGuards(AuthGuard) // All routes require authentication
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('student')
  @UseGuards(AdminGuard) // Only admin
  createStudent(@Body() dto: CreateStudentDto) {
    return this.userService.createStudent(dto);
  }

  @Get('admin')
  @UseGuards(AdminGuard)
  async createAdmin(){
    return await seed();
  }

  @Post('professor')
  @UseGuards(AdminGuard) // Only admin
  createProfessor(@Body() dto: CreateProfessorDto) {
    return this.userService.createProfessor(dto);
  }

  @Post('staff')
  @UseGuards(AdminGuard) // Only admin
  createStaff(@Body() dto: CreateStaffDto) {
    return this.userService.createStaff(dto);
  }

  @Get()
  getAllUsers(@Query('role') role?: string) {
    return this.userService.getAllUsers(role);
  }

  @Get(':id')
  getUserById(@Param('id') id: string) {
    return this.userService.getUserById(id);
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
}
