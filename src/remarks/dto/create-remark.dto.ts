import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RemarkEntityType } from '../schema/remark.schema';

export class CreateRemarkDto {
  @IsEnum(RemarkEntityType)
  @IsNotEmpty()
  entityType!: RemarkEntityType;

  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @IsString()
  @IsOptional()
  text?: string;

  @IsString()
  @IsOptional()
  attachmentUrl?: string;

  @IsString()
  @IsOptional()
  attachmentType?: 'image' | 'file';

  @IsString()
  @IsOptional()
  attachmentName?: string;
}