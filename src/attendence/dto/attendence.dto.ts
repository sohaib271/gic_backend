// attendence.dto.ts
import {
  IsInt,
  IsDateString,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

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

  // Required: without it a teacher teaching the same class in two periods is
  // blocked from marking the second lecture, and "days present" is unanswerable.
  @IsNotEmpty({ message: "lectureNumber is required" })
  @IsInt({ message: "lectureNumber must be an integer" })
  @Min(1, { message: "lectureNumber starts from 1" })
  lectureNumber!: number;

  @IsOptional()
  @IsInt()
  @Min(1, { message: "subjectId starts from 1" })
  subjectId?: number;
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

  @IsNotEmpty({ message: "lectureNumber is required" })
  @IsInt({ message: "lectureNumber must be an integer" })
  @Min(1, { message: "lectureNumber starts from 1" })
  lectureNumber!: number;
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

  @IsNotEmpty({ message: "lectureNumber is required" })
  @IsInt({ message: "lectureNumber must be an integer" })
  @Min(1, { message: "lectureNumber starts from 1" })
  lectureNumber!: number;

  @IsOptional()
  @IsInt()
  @Min(1, { message: "subjectId starts from 1" })
  subjectId?: number;

  @IsNotEmpty()
  records!: { studentId: string; attendenceStatus: "A" | "P" | "L" }[];
}
