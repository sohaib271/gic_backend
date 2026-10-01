import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RegistrationService } from './registration.service';
import {
  CreateRegistrationTokenDto,
  RegisterStudentDto,
  ReviewRegistrationDto,
} from './dto/create-user.dto/register-student.dto';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { RolesGuard } from 'src/others-stuff/guards/roles.guard';
import { Roles } from 'src/others-stuff/guards/roles.decorator';

/**
 * Split from UserController on purpose: that controller is wrapped in
 * AuthGuard at the class level, and the self-registration endpoints must stay
 * reachable by a logged-out student.
 */
@Controller('registration')
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  // ── Public: no AuthGuard on these three ──

  // Pre-fill data for the form (department, category, whether inter marks are
  // needed). Throttled because it is unauthenticated.
  @Get('link/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  getLinkInfo(@Param('token') token: string) {
    return this.registrationService.getPublicTokenInfo(token);
  }

  // Tight limit: one IP gets only a handful of attempts a minute, so a leaked
  // link cannot be used to flood the database with fake applications.
  @Post('apply')
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  apply(@Body() dto: RegisterStudentDto) {
    return this.registrationService.registerStudent(dto);
  }

  // ── HOD/admin only from here down ──

  @Post('links')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin', 'hod')
  createLink(@Body() dto: CreateRegistrationTokenDto, @Req() req: any) {
    const user = req?.user;
    return this.registrationService.createToken(
      dto,
      user?.sub,
      user?.department ?? undefined,
    );
  }

  // Admin sees every link; an HOD sees only their own department's.
  @Get('links')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin', 'hod')
  listLinks(@Req() req: any, @Query('department') department?: string) {
    const user = req?.user;
    const isAdmin = user?.role === 'admin';
    const scope = isAdmin
      ? (department || undefined)
      : (user?.department || undefined);
    return this.registrationService.listTokens(scope);
  }

  @Patch('links/:id/revoke')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin', 'hod')
  revokeLink(@Param('id') id: string) {
    return this.registrationService.revokeToken(id);
  }

  // The approval queue.
  @Get('pending')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin', 'hod')
  listPending(
    @Req() req: any,
    @Query('department') department?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req?.user;
    const isAdmin = user?.role === 'admin';
    const scope = isAdmin
      ? (department || undefined)
      : (user?.department || undefined);
    return this.registrationService.listPending(
      scope,
      Number(page) || 1,
      Number(limit) || 25,
    );
  }

  @Patch('applications/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin', 'hod')
  review(
    @Param('id') id: string,
    @Body() dto: ReviewRegistrationDto,
    @Req() req: any,
  ) {
    return this.registrationService.reviewStudent(id, dto, req?.user?.sub);
  }
}
