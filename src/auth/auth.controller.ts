// auth.controller.ts
import { Controller, Post, Body, Param, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AdminLoginDto } from './auth.dto/admin-login.dto';
import { QrVerifyDto } from './auth.dto/qr-verify.dto';
import { SetPasswordDto } from './auth.dto/set-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('admin/login')
  adminLogin(@Body() dto: AdminLoginDto) {
    return this.authService.adminLogin(dto.email, dto.password);
  }
  @Post('login')
  login(@Body() dto: AdminLoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('logout/:id')
  logout(@Param('id') id:string){
    return this.authService.logout(id);
  }

  @Post('forgot-password')
  forgotPassword(@Body() body:{email:string}){
    return this.authService.forgetPassword(body.email);
  }

  @Post('verify-otp')
  verifyOtp(@Body() body:{email:string,otp:string}){
    return this.authService.verifyOTP(body.email,body.otp);
  }

  @Post('reset-password')
  resetPassword(@Body() body : {email:string,newPassword:string}){
    return this.authService.resetPassword(body.email,body.newPassword);
  }
}
