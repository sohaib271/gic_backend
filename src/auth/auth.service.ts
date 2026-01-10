import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/user/schema/user.schema';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  /* ======================
     ADMIN LOGIN
  ======================= */
  async adminLogin(specialId: string, password: string) {
    const admin = await this.userModel.findOne({ specialId, role: 'admin' });

    if (!admin || !admin.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const match = await bcrypt.compare(password, admin.password);
    if (!match) throw new UnauthorizedException('Invalid credentials');

    return this.signToken(admin);
  }

  /* ======================
     QR VERIFY
  ======================= */
  async verifyQrToken(token: string) {
    const user = await this.userModel.findOne({ verifyToken: token });

    if (!user) throw new BadRequestException('Invalid QR token');
    if (user.isQrScanned) throw new BadRequestException('QR already used');

    return { message: 'QR verified', specialId: user.specialId };
  }

  /* ======================
     SET PASSWORD (FIRST TIME)
  ======================= */
  async setPassword(token: string, password: string) {
    const user = await this.userModel.findOne({ verifyToken: token });

    if (!user) throw new BadRequestException('Invalid token');
    if (user.isQrScanned) throw new BadRequestException('Password already set');

    user.password = await bcrypt.hash(password, 10);
    user.isQrScanned = true;
    user.verifyToken = undefined;

    await user.save();

    return this.signToken(user);
  }

  /* ======================
     NORMAL LOGIN
  ======================= */
  async login(specialId: string, password: string) {
    const user = await this.userModel.findOne({ specialId });

    if (!user || !user.password)
      throw new UnauthorizedException('Invalid credentials');

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new UnauthorizedException('Invalid credentials');

    return this.signToken(user);
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
