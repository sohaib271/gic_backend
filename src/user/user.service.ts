import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schema/user.schema';
import { CreateStudentDto } from './dto/create-user.dto/create-student.dto';
import { CreateProfessorDto } from './dto/create-user.dto/create-professor.dto';
import { CreateStaffDto } from './dto/create-user.dto/create-staff.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  /* ======================
     CREATE STUDENT
  ======================= */
  async createStudent(dto: CreateStudentDto) {
    await this.checkDuplicates(dto.specialId, dto.cnic);

    const verifyToken = uuidv4();

    const student = new this.userModel({
      ...dto,
      role: 'student',
      verifyToken,
      isQrScanned: false,
    });

    await student.save();

    return {
      message: 'Student created successfully',
      user: this.sanitizeUser(student),
      qrToken: verifyToken,
    };
  }

  /* ======================
     CREATE PROFESSOR
  ======================= */
  async createProfessor(dto: CreateProfessorDto) {
    await this.checkDuplicates(dto.specialId, dto.cnic);

    const verifyToken = uuidv4();

    const professor = new this.userModel({
      ...dto,
      role: 'proff',
      verifyToken,
      isQrScanned: false,
    });

    await professor.save();

    return {
      message: 'Professor created successfully',
      user: this.sanitizeUser(professor),
      qrToken: verifyToken,
    };
  }

  /* ======================
     CREATE STAFF
  ======================= */
  async createStaff(dto: CreateStaffDto) {
    await this.checkDuplicates(dto.specialId, dto.cnic);

    const verifyToken = uuidv4();

    const staff = new this.userModel({
      ...dto,
      role: 'staff',
      verifyToken,
      isQrScanned: false,
    });

    await staff.save();

    return {
      message: 'Staff created successfully',
      user: this.sanitizeUser(staff),
      qrToken: verifyToken,
    };
  }

  /* ======================
     GET ALL USERS
  ======================= */
  async getAllUsers(role?: string) {
    const filter = role ? { role } : {};
    const users = await this.userModel.find(filter).populate('department');

    return users.map((user) => this.sanitizeUser(user));
  }

  /* ======================
     GET USER BY ID
  ======================= */
  async getUserById(id: string) {
    const user = await this.userModel.findById(id).populate('department');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.sanitizeUser(user);
  }

  /* ======================
     GET USER BY SPECIAL ID
  ======================= */
  async getUserBySpecialId(specialId: string) {
    const user = await this.userModel
      .findOne({ specialId })
      .populate('department');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.sanitizeUser(user);
  }

  /* ======================
     UPDATE USER
  ======================= */
  async updateUser(id: string, updateData: any) {
    const user = await this.userModel.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if updating specialId or cnic
    if (updateData.specialId && updateData.specialId !== user.specialId) {
      const existingUser = await this.userModel.findOne({
        specialId: updateData.specialId,
      });
      if (existingUser) {
        throw new ConflictException('Special ID already exists');
      }
    }

    if (updateData.cnic && updateData.cnic !== user.cnic) {
      const existingUser = await this.userModel.findOne({
        cnic: updateData.cnic,
      });
      if (existingUser) {
        throw new ConflictException('CNIC already exists');
      }
    }

    // Don't allow updating password, verifyToken, or isQrScanned through this endpoint
    delete updateData.password;
    delete updateData.verifyToken;
    delete updateData.isQrScanned;
    delete updateData.role; // Don't allow role change

    Object.assign(user, updateData);
    await user.save();

    return {
      message: 'User updated successfully',
      user: this.sanitizeUser(user),
    };
  }

  /* ======================
     DELETE USER
  ======================= */
  async deleteUser(id: string) {
    const user = await this.userModel.findByIdAndDelete(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      message: 'User deleted successfully',
      deletedUser: this.sanitizeUser(user),
    };
  }

  /* ======================
     HELPER: CHECK DUPLICATES
  ======================= */
  private async checkDuplicates(specialId: string, cnic: string) {
    const existingSpecialId = await this.userModel.findOne({ specialId });
    if (existingSpecialId) {
      throw new ConflictException('Special ID already exists');
    }

    const existingCnic = await this.userModel.findOne({ cnic });
    if (existingCnic) {
      throw new ConflictException('CNIC already exists');
    }
  }

  /* ======================
     HELPER: SANITIZE USER
  ======================= */
  private sanitizeUser(user: UserDocument) {
    const userObject = user.toObject();
    delete userObject.password;
    delete userObject.verifyToken;
    delete userObject.__v;
    return userObject;
  }
}
