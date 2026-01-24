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

  // @Post('qr/verify')
  // verifyQr(@Body() dto: QrVerifyDto) {
  //   return this.authService.verifyQrToken(dto.token);
  // }

  // @Post('set-password')
  // setPassword(@Body() dto: SetPasswordDto) {
  //   return this.authService.setPassword(dto.token, dto.password);
  // }

  @Post('login')
  login(@Body() dto: AdminLoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('logout/:id')
  logout(@Param('id') id:string){
    return this.authService.logout(id);
  }
}
