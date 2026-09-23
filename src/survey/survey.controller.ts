import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { RolesGuard } from 'src/others-stuff/guards/roles.guard';
import { Roles } from 'src/others-stuff/guards/roles.decorator';
import { SurveyService } from './survey.service';
import { SaveSurveyDto, SubmitSurveyDto } from './dto/survey.dto';

@UseGuards(AuthGuard)
@Controller('surveys')
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  @Get()
  getSurveys() {
    return this.surveyService.getSurveys();
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  @Post()
  createSurvey(@Body() dto: SaveSurveyDto, @Req() req: any) {
    return this.surveyService.createSurvey(dto, req.user.sub, req.user.role);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  @Patch(':id')
  updateSurvey(@Param('id') id: string, @Body() dto: SaveSurveyDto) {
    return this.surveyService.updateSurvey(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() body: { status: string }) {
    const status = body.status === 'inactive' ? 'inactive' : 'active';
    return this.surveyService.setStatus(id, status);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  @Delete(':id')
  deleteSurvey(@Param('id') id: string) {
    return this.surveyService.deleteSurvey(id);
  }

  @Get('available')
  getAvailableSurveys(@Req() req: any) {
    return this.surveyService.getAvailableSurveys(req.user.sub);
  }

  @Get(':id/take')
  getSurveyForTake(@Param('id') id: string, @Req() req: any) {
    return this.surveyService.getSurveyForTake(id, req.user.sub);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  @Get(':id')
  getSurveyDetail(@Param('id') id: string) {
    return this.surveyService.getSurveyDetail(id);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'hod')
  @Get(':id/responses')
  getSurveyResponses(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.surveyService.getSurveyResponses(
      id,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  @Post(':id/submit')
  submitSurvey(
    @Param('id') id: string,
    @Body() dto: SubmitSurveyDto,
    @Req() req: any,
  ) {
    return this.surveyService.submitSurvey(id, req.user.sub, dto);
  }
}