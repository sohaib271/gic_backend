import { IsString, IsNotEmpty, IsMongoId, IsArray } from 'class-validator';

export class CreateAnnouncementDto {
  @IsMongoId({ message: 'Invalid teacher ID' })
  @IsNotEmpty({ message: 'Teacher ID is required' })
  teacherId!: string;

  @IsNotEmpty({ message: 'Class name is required' })
  className!: string | string[];

  @IsNotEmpty({ message: 'Title is required' })
  @IsString()
  title!: string;

  @IsNotEmpty({ message: 'Description is required' })
  @IsString()
  description!: string;
}