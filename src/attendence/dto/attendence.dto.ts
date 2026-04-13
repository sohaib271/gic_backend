// attendence.dto.ts
import { IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, IsIn, IsDateString } from "class-validator";

export class CreateAttendenceDto {
  @IsMongoId({ message: "Invalid class ID" })
  classId!: string;

  @IsMongoId({ message: "Invalid teacher ID" })
  teacherId!: string;

  @IsMongoId({ message: "Invalid student ID" })
  studentId!: string;

  @IsNotEmpty({ message: "Attendance status is required" })
  @IsString()
  @IsIn(["A", "P", "L"], { message: "Status must be A (Absent), P (Present), or L (Leave)" })
  attendenceStatus!: string;

  @IsNotEmpty({ message: "Date is required" })
  @IsDateString({}, { message: "Date must be a valid ISO date string (e.g. 2025-03-10)" })
  date!: string;

  @IsOptional()
  @IsNumber()
  lectureNumber?: number;
}

export class UpdateAttendenceDto{
  @IsMongoId({ message: "Invalid class ID" })
  classId!: string;

  @IsMongoId({ message: "Invalid teacher ID" })
  teacherId!: string;

  @IsMongoId({ message: "Invalid student ID" })
  studentId!: string;

  @IsNotEmpty({ message: "Attendance status is required" })
  @IsString()
  @IsIn(["A", "P", "L"], { message: "Status must be A (Absent), P (Present), or L (Leave)" })
  attendenceStatus!: string;

}

// ✅ For marking attendance for an entire class in one request
export class BulkAttendenceDto {
  @IsMongoId({ message: "Invalid class ID" })
  classId!: string;

  @IsMongoId({ message: "Invalid teacher ID" })
  teacherId!: string;

  @IsNotEmpty({ message: "Date is required" })
  @IsDateString({}, { message: "Date must be a valid ISO date string" })
  date!: string;

  @IsOptional()
  @IsNumber()
  lectureNumber?: number;

  @IsNotEmpty()
  records!: { studentId: string; attendenceStatus: "A" | "P" | "L" }[];
}