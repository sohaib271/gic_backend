import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsNumber,
  IsMongoId,
  IsOptional,
  IsIn,
  Matches,
  Length,
  Min,
  Max,
  IsDateString,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Public self-registration payload. Deliberately does NOT extend
 * CreateBaseUserDto: the student must not be able to choose their own role,
 * department, category or class — those all come from the registration token.
 */
export class RegisterStudentDto {
  @IsNotEmpty({ message: 'Registration link is required' })
  @IsString()
  registrationToken!: string;

  @IsNotEmpty({ message: 'First name is required' })
  @IsString()
  @Length(1, 30, { message: 'First name must not exceed 30 characters' })
  name!: string;

  @IsNotEmpty({ message: 'Last name is required' })
  @IsString()
  @Length(1, 30, { message: 'Last name must not exceed 30 characters' })
  lastName!: string;

  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Invalid email format' })
  email!: string;

  @IsNotEmpty({ message: 'Password is required' })
  @IsString()
  @Length(8, 64, { message: 'Password must be at least 8 characters' })
  password!: string;

  @IsNotEmpty({ message: 'CNIC is required' })
  @IsString()
  @Matches(/^\d{13}$/, { message: 'CNIC must be exactly 13 digits, no dashes' })
  cnic!: string;

  @IsNotEmpty({ message: 'Phone is required' })
  @IsString()
  @Matches(/^(92\d{10}|0\d{10})$/, {
    message: 'Phone must be 12 digits starting with 92, or 11 digits starting with 0',
  })
  phone!: string;

  @IsNotEmpty({ message: 'Address is required' })
  @IsString()
  address!: string;

  @IsNotEmpty({ message: 'City is required' })
  @IsString()
  city!: string;

  @IsNotEmpty({ message: 'Roll No is required' })
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Roll No starts from 1' })
  rollNo!: number;

  @IsNotEmpty({ message: 'Matric marks are required' })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Matric marks must be between 0 and 1200' })
  @Max(1200, { message: 'Matric marks must be between 0 and 1200' })
  matricMarks!: number;

  // Only BS/ADP students sit the inter test, so this is skipped for the
  // intermediate programme. The controller fills category from the token
  // before validation runs.
  @ValidateIf((o) => o.category !== 'intermediate')
  @IsNotEmpty({ message: 'Inter marks are required' })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Inter marks must be between 0 and 1200' })
  @Max(1200, { message: 'Inter marks must be between 0 and 1200' })
  interMarks?: number;

  @IsNotEmpty({ message: 'Date of joining is required' })
  @IsDateString({}, { message: 'Date must be a valid ISO date string' })
  doj!: string;

  @IsOptional()
  @IsString()
  @Matches(/^(92\d{10}|0\d{10})$/, {
    message: 'WhatsApp number must be 12 digits starting with 92, or 11 digits starting with 0',
  })
  whatsappNumber?: string;

  // Comma-separated on the form, split by the service.
  @IsOptional()
  @IsString()
  subjects?: string;

  @IsOptional()
  @IsIn(['M', 'F'], { message: 'Gender must be M or F' })
  gender?: string;

  // Only honoured when the registration link did not lock a class, so a
  // class-locked link can never have its class overridden from the client.
  @IsOptional()
  @IsIn(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'])
  class?: string;

  // ── Filled server-side from the token; not accepted from the client body.
  @IsOptional()
  @IsString()
  category?: string;
}

/** Payload a HOD/admin uses to mint a registration link. */
export class CreateRegistrationTokenDto {
  @IsNotEmpty({ message: 'Department is required' })
  @IsMongoId({ message: 'Invalid department ID' })
  department!: string;

  @IsOptional()
  @IsIn(['intermediate', 'bs', 'adp'])
  category?: string;

  @IsOptional()
  @IsIn(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'])
  class?: string;

  @IsOptional()
  @IsString()
  session?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Max uses must be at least 1' })
  @Max(1000, { message: 'Max uses cannot exceed 1000' })
  maxUses?: number;

  /** Days until the link stops working. Omit for a link that never expires. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Validity must be at least 1 day' })
  @Max(365, { message: 'Validity cannot exceed 365 days' })
  expiresInDays?: number;
}

/** HOD/admin decision on a pending application. */
export class ReviewRegistrationDto {
  @IsNotEmpty({ message: 'Decision is required' })
  @IsIn(['approved', 'rejected'], {
    message: 'Decision must be either approved or rejected',
  })
  decision!: 'approved' | 'rejected';

  // Required to reject, so the student knows why.
  @ValidateIf((o) => o.decision === 'rejected')
  @IsNotEmpty({ message: 'A reason is required when rejecting' })
  @IsString()
  reason?: string;
}
