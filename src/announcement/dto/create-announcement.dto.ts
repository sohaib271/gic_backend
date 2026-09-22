import { IsOptional, IsMongoId, IsNotEmpty, IsString, IsArray } from 'class-validator';

export class CreateAnnouncementDto {
  @IsOptional()
  @IsMongoId({ message: 'Invalid teacher ID' })
  teacherId?: string;

  @IsNotEmpty({ message: 'Class name is required' })
  className!: string | string[];

  @IsNotEmpty({ message: 'Title is required' })
  @IsString()
  title!: string;

  @IsNotEmpty({ message: 'Description is required' })
  @IsString()
  description!: string;
}