import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { RemarksService } from './remarks.service';
import { RemarkEntityType } from './schema/remark.schema';

@UseGuards(AuthGuard)
@Controller('remarks')
export class RemarksController {
  constructor(private readonly remarksService: RemarksService) {}

  @Post()
  createRemark(
    @Body('entityType') entityType: string,
    @Body('entityId') entityId: string,
    @Body('text') text: string,
    @Req() req: any,
  ) {
    return this.remarksService.createRemark(entityType, entityId, req.user.sub, text);
  }

  @Get()
  getRemarks(
    @Query('entityType') entityType?: RemarkEntityType,
    @Query('entityId') entityId?: string,
  ) {
    if (entityType && entityId) {
      return this.remarksService.getRemarksByEntity(entityType, entityId);
    }
    return this.remarksService.getAllRemarks(entityType);
  }

  @Get('entity/:entityType/:entityId')
  getRemarksByEntity(
    @Param('entityType') entityType: RemarkEntityType,
    @Param('entityId') entityId: string,
  ) {
    return this.remarksService.getRemarksByEntity(entityType, entityId);
  }

  @Delete(':id')
  deleteRemark(@Param('id') id: string, @Req() req: any) {
    return this.remarksService.deleteRemark(id, req.user.sub, req.user.role);
  }
}