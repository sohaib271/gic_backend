import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { EmailService } from 'src/others-stuff/utils/sendEmail.service';
import { createHash, randomBytes, randomInt } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService, private emailService:EmailService
  ) {}

  private getAccessTokenCookieOptions() {
    // `Secure` cookies are deliberately ignored by browsers on an HTTP local
    // development server.  Set COOKIE_SECURE=true in production (and use
    // HTTPS); COOKIE_SAME_SITE=none is required only when the web app and API
    // are on different sites.
    const sameSite = 'none';
    const secure =true

    return {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: 20 * 24 * 60 * 60 * 1000,
      path: '/',
    } as const;
  }

  /* ======================
     ADMIN LOGIN
  ======================= */
  async adminLogin(email: string, password: string,response:any) {
    const admin = await this.userModel.findOne({ email, role: 'admin' })
    if (!admin || !admin.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const match = await bcrypt.compare(password, admin.password);
    if (!match) throw new UnauthorizedException('Invalid credentials');
    const res=this.signToken(admin);
    response.cookie('access_token', res.access_token, this.getAccessTokenCookieOptions());
    const token=res.access_token;
    admin.verifyToken=token;
    await admin.save();

    return res;
  }

  private generateOTP() {
    return randomInt(100000, 1000000).toString();
  }

  private hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  async forgetPassword(email: string) {
    const normalizedEmail = email.trim();
    const user = await this.userModel
      .findOne({ email: normalizedEmail })
      .select('otp otpExpiry passwordResetToken passwordResetExpiry');

    if (!user) {
      throw new BadRequestException('Email does not exist');
    }

    const code = this.generateOTP();
    const otpHash = await bcrypt.hash(code, 10);
    user.otp = otpHash;
    user.otpExpiry = Date.now() + 10 * 60 * 1000;
    user.passwordResetToken = null;
    user.passwordResetExpiry = null;

    await user.save();

    try {
      await this.emailService.sendEmail(
        normalizedEmail,
        'Password Reset OTP',
        `<h2>Your OTP is: ${code}</h2>
         <p>This OTP will expire in 10 minutes.</p>`,
      );
    } catch {
      await this.userModel.updateOne(
        { _id: user._id, otp: otpHash },
        { $set: { otp: null, otpExpiry: null } },
      );
      throw new ServiceUnavailableException(
        'Unable to send the password reset email. Please try again.',
      );
    }

    return { message: 'OTP sent to email' };
  }

  async verifyOTP(email: string, otp: string) {
    const user = await this.userModel
      .findOne({ email: email.trim() })
      .select('otp otpExpiry passwordResetToken passwordResetExpiry');

    const validOtp = Boolean(
      user?.otp &&
        user.otpExpiry &&
        user.otpExpiry >= Date.now() &&
        (await bcrypt.compare(otp, user.otp)),
    );

    if (!user || !validOtp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const resetToken = randomBytes(32).toString('hex');
    user.otp = null;
    user.otpExpiry = null;
    user.passwordResetToken = this.hashResetToken(resetToken);
    user.passwordResetExpiry = Date.now() + 10 * 60 * 1000;
    await user.save();

    return { message: 'OTP verified', resetToken };
  }

  async resetPassword(email: string, password: string, resetToken: string) {
    const user = await this.userModel
      .findOne({ email: email.trim() })
      .select('password passwordResetToken passwordResetExpiry verifyToken');

    const tokenHash = this.hashResetToken(resetToken);
    if (
      !user ||
      !user.passwordResetToken ||
      user.passwordResetToken !== tokenHash ||
      !user.passwordResetExpiry ||
      user.passwordResetExpiry < Date.now()
    ) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    user.password = await bcrypt.hash(password, 10);
    user.passwordResetToken = null;
    user.passwordResetExpiry = null;
    user.verifyToken = undefined;

    await user.save();

    return { message: 'Password reset successful' };
  }

  /* ======================
     QR VERIFY
  ======================= */
  // async verifyQrToken(token: string) {
  //   const user = await this.userModel.findOne({ verifyToken: token });

  //   if (!user) throw new BadRequestException('Invalid QR token');
  //   if (user.isQrScanned) throw new BadRequestException('QR already used');

  //   return { message: 'QR verified', specialId: user.specialId };
  // }

  /* ======================
     SET PASSWORD (FIRST TIME)
  ======================= */
  // async setPassword(token: string, password: string) {
  //   const user = await this.userModel.findOne({ verifyToken: token });

  //   if (!user) throw new BadRequestException('Invalid token');
  //   if (user.isQrScanned) throw new BadRequestException('Password already set');

  //   user.password = await bcrypt.hash(password, 10);
  //   user.isQrScanned = true;
  //   user.verifyToken = undefined;

  //   await user.save();

  //   return this.signToken(user);
  // }

  /* ======================
     NORMAL LOGIN
  ======================= */
  async login(email: string, password: string,response:any) {
    const user = await this.userModel.findOne({ email });

    if (!user || !user.password)
      throw new UnauthorizedException('Invalid credentials');

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new UnauthorizedException('Invalid credentials');
    const res=this.signToken(user);
    response.cookie('access_token', res.access_token, this.getAccessTokenCookieOptions());
    user.verifyToken=res.access_token;
    await user.save();
    return res;
  }

  async logout(userId:string,res:any){
    const logoutUser=await this.userModel.findByIdAndUpdate({_id:userId},{$set:{verifyToken:null}})
    const { maxAge, ...cookieOptions } = this.getAccessTokenCookieOptions();
    res.clearCookie('access_token', cookieOptions);
    if(!logoutUser){
      throw new BadRequestException("Invalid User Id");
    }

    return {
      message:"Logged Out"
    }
  }

  /* ======================
     JWT SIGN WITH USER DATA
  ======================= */
  private signToken(user: UserDocument) {
    const payload = {
      sub: user._id,
      role: user.role,
    };

    // Convert to plain object and remove sensitive fields
    const userObject = user.toObject();
    delete userObject.password;
    delete userObject.verifyToken;
    delete userObject.__v;

    return {
      access_token: this.jwtService.sign(payload),
      user: userObject,
    };
  }
}
