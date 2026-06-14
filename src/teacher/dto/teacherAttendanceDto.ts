import { Type } from 'class-transformer';
import {
  IsDate,
  IsMongoId,
  IsNotEmpty,
  IsString,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Types } from 'mongoose';

export class LocationDto {
  @IsNotEmpty({ message: 'Longitude is required' })
  longitude!: number;

  @IsNotEmpty({ message: 'Latitude is required' })
  latitude!: number;
}

export class TeacherAttendanceDto {
  @IsNotEmpty({ message: 'Type is required' })
  @IsString()
  type!: string;

  @IsDate({ message: 'Invalid date' })
  @Type(() => Date)
  currentDate?: Date;

  @ValidateNested({ each: true })
  @Type(() => LocationDto)
  @IsNotEmpty()
  gps!: LocationDto;

  @IsOptional()
  @IsString()
  macAddress?: string;

  @IsOptional()
  @IsString()
  qrPayload?: string;

  @IsOptional()
  @IsString()
  qrSignature?: string;
}
