import { IsDateString,isString,IsMongoId,MinLength, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class StruckOffStudentDto {
  @IsString()
  @IsNotEmpty({ message: 'Reason is required' })
  reason!: string;

  @IsDateString()
  @IsNotEmpty({message:"Start date is required"})
  start!:string

  @IsOptional()
  @IsDateString()
  end?:string
}

// dto/unstruck-off.dto.ts

export class UnStruckOffStudentDto {
  @IsString()
  @IsNotEmpty({ message: 'Reason is required' })
  @MinLength(5, { message: 'Reason must be at least 5 characters' })
  reason!: string;
}