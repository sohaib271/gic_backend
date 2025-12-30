import { Body, Controller, Post, Request, UseGuards,Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/userDto';
import { AuthGuard } from './auth.guard';
import { PermissionsGuard } from './roles/role.guard';
import { Permission } from './roles/role.decorator';
import { Permissions } from './roles/permission';

@UseGuards(AuthGuard,PermissionsGuard)
@Controller('user')
export class AuthController {
  constructor(private readonly authService:AuthService){}
  @Post('admin/signin')
  async adminSignIn(@Body() loginDto:LoginDto){
   try {
     return await this.authService.signIn(loginDto);
   } catch (error) {
    return {msg:error.message}
   }
  }

  @Get('profile')
  getProfile(@Request() req){
    return req.user;
  }

  @Post("add-student")
  @Permission(Permissions.ADD_STUDENTS)
  createStudent(){
    return {msg:"Student added!"}
  }

}
