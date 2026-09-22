// auth.controller.ts
import { Controller, Post, Body, Param, Get, Res, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AdminLoginDto } from './auth.dto/admin-login.dto';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyOtpDto,
} from './auth.dto/password-reset.dto';
import { ChangePasswordDto } from './auth.dto/change-password.dto';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';

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
  @Throttle({ default: { limit: 3, ttl: 15 * 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgetPassword(dto.email);
  }

  @UseGuards(AuthGuard)
  @Post('change-password')
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  changePassword(@Body() dto: ChangePasswordDto, @Req() req: any) {
    return this.authService.changePassword(
      req.user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Post('verify-otp')
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOTP(dto.email, dto.otp);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(
      dto.email,
      dto.newPassword,
      dto.resetToken,
    );
  }
}
