import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;
}

export class VerifyOtpDto extends ForgotPasswordDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must contain exactly 6 digits' })
  otp: string;
}

export class ResetPasswordDto extends ForgotPasswordDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-f0-9]{64}$/i, { message: 'Invalid password reset token' })
  resetToken: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
