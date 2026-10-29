import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { RolesGuard } from 'src/others-stuff/guards/roles.guard';
import { Roles } from 'src/others-stuff/guards/roles.decorator';
import { AssignmentService } from './assignment.service';
import {
  CreateAssignmentDto,
  GradeSubmissionDto,
  SubmitAssignmentDto,
  UpdateAssignmentDto,
} from './dto/assignment.dto';
import { ASSIGNMENT_MAX_FILE_BYTES } from './assignment.constants';

@UseGuards(AuthGuard)
@Controller('assignment')
export class AssignmentController {
  private readonly logger = new Logger(AssignmentController.name);

  constructor(private readonly assignmentService: AssignmentService) {}

  // ============================================================
  // FILES
  // ============================================================

  @Post('upload')
  @UseGuards(RolesGuard)
  @Roles('proff', 'hod', 'student')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: ASSIGNMENT_MAX_FILE_BYTES, files: 1 },
    }),
  )
  uploadFile(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    return this.assignmentService.uploadFile(req.user.sub, file);
  }

  @Get(':id/files/:fileId')
  @UseGuards(RolesGuard)
  @Roles('proff', 'hod', 'student', 'admin')
  async downloadFile(
    @Req() req: any,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Query('submissionId') submissionId: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.assignmentService.getFile(
      req.user.sub,
      id,
      fileId,
      submissionId,
    );

    res.setHeader('Content-Type', file.mime || 'application/octet-stream');
    res.setHeader('Content-Length', String(file.size));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );

    file.stream.on('error', (error) => {
      this.logger.error(`Assignment file stream failed: ${error}`);
      if (!res.headersSent) {
        res.status(404).json({ message: 'File not found' });
      } else {
        res.end();
      }
    });

    file.stream.pipe(res);
  }

  // ============================================================
  // ASSIGNMENTS
  // ============================================================

  @Post()
  @UseGuards(RolesGuard)
  @Roles('proff', 'hod')
  create(@Req() req: any, @Body() dto: CreateAssignmentDto) {
    return this.assignmentService.create(req.user.sub, dto);
  }

  /** Teacher/HOD list, optionally narrowed to one class. */
  @Get()
  @UseGuards(RolesGuard)
  @Roles('proff', 'hod', 'admin')
  listManaged(@Req() req: any, @Query() query: any) {
    return this.assignmentService.listManaged(req.user.sub, query);
  }

  /** Student's own assignments with submission state. */
  @Get('my')
  @UseGuards(RolesGuard)
  @Roles('student')
  listMine(@Req() req: any, @Query() query: any) {
    return this.assignmentService.listMine(req.user.sub, query);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('proff', 'hod', 'student', 'admin')
  getDetail(@Req() req: any, @Param('id') id: string) {
    return this.assignmentService.getDetail(req.user.sub, id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('proff', 'hod')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.assignmentService.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('proff', 'hod')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.assignmentService.remove(req.user.sub, id);
  }

  // ============================================================
  // SUBMISSIONS
  // ============================================================

  @Post(':id/submit')
  @UseGuards(RolesGuard)
  @Roles('student')
  submit(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SubmitAssignmentDto,
  ) {
    return this.assignmentService.submit(req.user.sub, id, dto);
  }

  @Get(':id/submissions')
  @UseGuards(RolesGuard)
  @Roles('proff', 'hod')
  listSubmissions(
    @Req() req: any,
    @Param('id') id: string,
    @Query() query: any,
  ) {
    return this.assignmentService.listSubmissions(req.user.sub, id, query);
  }

  @Patch(':id/submissions/:submissionId/grade')
  @UseGuards(RolesGuard)
  @Roles('proff', 'hod')
  grade(
    @Req() req: any,
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: GradeSubmissionDto,
  ) {
    return this.assignmentService.grade(
      req.user.sub,
      id,
      submissionId,
      dto,
    );
  }
}
