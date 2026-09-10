import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { RolesGuard } from 'src/others-stuff/guards/roles.guard';
import { Roles } from 'src/others-stuff/guards/roles.decorator';
import { FeeService } from './fee.service';
import {
  CreateFeeDto,
  GenerateFeeDto,
  GetDepartmentStudentsFeeDto,
  GetFeeRecordsDto,
  UpdateFeeStatusDto,
} from './fee.dto';
import { User, UserDocument } from 'src/user/schema/user.schema';

@UseGuards(AuthGuard)
@Controller('fee')
export class FeeController {
  constructor(
    private readonly feeService: FeeService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  @Get('student/:studentId/summary')
  async getStudentSummary(
    @Param('studentId') studentId: string,
    @Query('year') year?: string,
    @Req() req?: any,
  ) {
    const userId = req.user.sub;
    const isAdminOrHod = ['admin', 'proff'].includes(req.user.role);
    if (!isAdminOrHod && userId !== studentId) {
      throw new ForbiddenException('Access denied - Cannot view other student fees');
    }
    return this.feeService.getStudentFeeSummary(studentId, year);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  @Get('departments-students-fee')
  async getDepartmentStudentsFee(
    @Query() query: GetDepartmentStudentsFeeDto,
    @Req() req?: any,
  ) {
    const user = await this.userModel.findById(req.user.sub).select('_id department role').lean();
    const isHod = user?.department && user.department.toString() === query.departmentId;
    if (req.user.role !== 'admin' && !isHod) {
      throw new ForbiddenException(
        'HOD can only access their own department',
      );
    }
    return this.feeService.getDepartmentStudentsFee(query);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  @Post('create')
  createFee(@Body() dto: CreateFeeDto) {
    return this.feeService.createFee(dto);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  @Post('generate-monthly/:departmentId')
  generateMonthly(
    @Param('departmentId') departmentId: string,
    @Body('month') month: string,
    @Body('year') year: number,
  ) {
    return this.feeService.generateMonthlyFees(departmentId, month, year);
  }

  // ============================================================
  // ADMIN PORTAL FEE MANAGEMENT
  // ============================================================

  private async getActor(req: any) {
    const user = await this.userModel
      .findById(req.user?.sub)
      .select('_id name role')
      .lean();
    return {
      _id: user?._id?.toString() || req.user?.sub,
      name: user?.name || 'Admin',
      role: user?.role || req.user?.role || 'admin',
    };
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post('generate')
  async generateFee(@Body() dto: GenerateFeeDto, @Req() req: any) {
    const actor = await this.getActor(req);
    return this.feeService.generateFee(dto, actor);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get('records')
  getFeeRecords(@Query() query: GetFeeRecordsDto) {
    return this.feeService.getFeeRecords(query);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get('records/:id')
  getFeeRecord(@Param('id') id: string) {
    return this.feeService.getFeeRecordById(id);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Patch('records/:id/status')
  async updateFeeStatus(
    @Param('id') id: string,
    @Body() dto: UpdateFeeStatusDto,
    @Req() req: any,
  ) {
    const actor = await this.getActor(req);
    return this.feeService.updateFeeStatus(id, dto, actor);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Patch('records/:id/approve')
  async approveFee(@Param('id') id: string, @Req() req: any) {
    const actor = await this.getActor(req);
    return this.feeService.approveFee(id, actor);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Patch('records/:id/unapprove')
  unapproveFee(@Param('id') id: string) {
    return this.feeService.unapproveFee(id);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Delete('records/:id')
  deleteFeeRecord(@Param('id') id: string) {
    return this.feeService.deleteFeeRecord(id);
  }
}