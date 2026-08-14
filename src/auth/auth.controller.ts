// auth.controller.ts
import { Controller, Post, Body, Param, Get, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AdminLoginDto } from './auth.dto/admin-login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('admin/login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  adminLogin(@Body() dto: AdminLoginDto,@Res({ passthrough: true }) res:any) {
    return this.authService.adminLogin(dto.email, dto.password,res);
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: AdminLoginDto,@Res({ passthrough: true }) res:any) {
    return this.authService.login(dto.email, dto.password,res);
  }

  @Get('logout/:id')
  logout(@Param('id') id:string, @Res({ passthrough: true }) res:any){
    return this.authService.logout(id,res);
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
