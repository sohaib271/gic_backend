import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class QuestionDto {
  @IsNotEmpty({ message: 'Question text is required' })
  @IsString()
  question!: string;

  @IsIn(['text', 'single', 'multiple'], { message: 'Invalid question type' })
  type!: 'text' | 'single' | 'multiple';

  @IsOptional()
  @IsArray()
  options?: string[];

  @IsOptional()
  required?: boolean;
}

export class SaveSurveyDto {
  @IsNotEmpty({ message: 'Title is required' })
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions!: QuestionDto[];

  @IsArray()
  classNames!: string[];

  @IsOptional()
  @IsIn(['intermediate', 'bs', 'adp'])
  category?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class SurveyAnswerDto {
  @IsNotEmpty()
  questionIndex!: number;

  @IsString()
  question!: string;

  @IsIn(['text', 'single', 'multiple'])
  type!: string;

  @IsOptional()
  answer?: string | string[];
}

export class SubmitSurveyDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SurveyAnswerDto)
  answers!: SurveyAnswerDto[];
}