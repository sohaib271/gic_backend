import {
  IsBoolean,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateSubjectDto {
  // Omit to let the service assign the next id.
  @IsOptional()
  @IsInt({ message: 'subjectId must be an integer' })
  @Min(1, { message: 'subjectId starts from 1' })
  subjectId?: number;

  @IsString()
  @IsNotEmpty({ message: 'Subject name is required' })
  @Length(1, 60)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  code?: string;

  @IsOptional()
  @IsMongoId({ message: 'Invalid department ID' })
  department?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSubjectDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  code?: string;

  @IsOptional()
  @IsMongoId({ message: 'Invalid department ID' })
  department?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
