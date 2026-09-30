import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SubjectService } from './subject.service';
import { CreateSubjectDto, UpdateSubjectDto } from './dto/subject.dto';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { AdminGuard } from 'src/others-stuff/guards/admin.guard';
import { RolesGuard } from 'src/others-stuff/guards/roles.guard';
import { Roles } from 'src/others-stuff/guards/roles.decorator';

@Controller('subjects')
@UseGuards(AuthGuard)
export class SubjectController {
  constructor(private readonly subjectService: SubjectService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() dto: CreateSubjectDto) {
    return this.subjectService.create(dto);
  }

  // Any authenticated user needs the list to render pickers, so this stays
  // readable by students and staff too.
  @Get()
  getAll(@Query('department') department?: string, @Query('category') category?: string) {
    return this.subjectService.getAll(department, category);
  }

  @Get(':subjectId')
  getOne(@Param('subjectId', ParseIntPipe) subjectId: number) {
    return this.subjectService.getBySubjectId(subjectId);
  }

  @Put(':subjectId')
  @UseGuards(AdminGuard)
  update(@Param('subjectId', ParseIntPipe) subjectId: number, @Body() dto: UpdateSubjectDto) {
    return this.subjectService.update(subjectId, dto);
  }

  @Delete(':subjectId')
  @UseGuards(AdminGuard)
  remove(@Param('subjectId', ParseIntPipe) subjectId: number) {
    return this.subjectService.remove(subjectId);
  }
}
