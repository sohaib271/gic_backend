import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
