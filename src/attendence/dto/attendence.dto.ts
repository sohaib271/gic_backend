import { IsBoolean, IsDate, IsMongoId, IsNotEmpty, IsNumber, IsOptional } from "class-validator";

export class CreateAttendenceDto {
  @IsMongoId({ message: 'Invalid class ID' })
  classId!: string;

  @IsMongoId({ message: 'Invalid teacher ID' })
  teacherId!: string;

   @IsMongoId({ message: 'Invalid student ID' })
  studentId!: string;

  @IsNotEmpty({ message: 'Invalid Status Type' })
  @IsBoolean()
  isPresent!: boolean;

  @IsNotEmpty({message:"Date required"})
  @IsDate()
  data!:Date

  @IsOptional()
  @IsNumber()

  lectureNumber?:number

}
