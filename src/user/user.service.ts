import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { User, UserDocument } from './schema/user.schema';
import { CreateStudentDto } from './dto/create-user.dto/create-student.dto';
import { CreateProfessorDto } from './dto/create-user.dto/create-professor.dto';
import { CreateStaffDto } from './dto/create-user.dto/create-staff.dto';
import { v4 as uuidv4 } from 'uuid';
import { Department } from 'src/department/schema/department.schema';

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>, 
@InjectModel('Department') private departmentModel: Model<Department>,) {}

  hashPassword(password: string) {
    return bcrypt.hash(password, 10);
  }

  /* ======================
     CREATE STUDENT
  ======================= */
  async createStudent(dto: CreateStudentDto) {
    try {
      await this.checkDuplicates(dto.cnic);

      const verifyToken = uuidv4();

      const student = new this.userModel({
        ...dto,
        role: 'student',
        password: await this.hashPassword(dto.password),
        verifyToken,
        isQrScanned: false,
      });

      const department=await this.departmentModel.findById(student.department);
      if(!department){
        throw new BadRequestException("Department not found");
      }
      student.specialId = `STU-${department.code}-${student.cnic.slice(-4)}`;
      await student.save();

      return {
        message: 'Student created successfully',
        user: this.sanitizeUser(student),
        qrToken: verifyToken,
      };
    } catch (error) {
      // Mongoose validation error (required fields, enum, etc.)
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map((e: any) => e.message);
        throw new BadRequestException({
          message: 'Validation failed',
          errors: messages,
        });
      }

      // MongoDB duplicate key (unique constraint)
      if (error.code === 11000) {
        const field = Object.keys(error.keyValue)[0];
        const value = error.keyValue[field];
        throw new ConflictException(`${field} '${value}' already exists`);
      }

      // Re-throw known NestJS HTTP exceptions (from checkDuplicates, etc.)
      if (error instanceof HttpException) throw error;

      // Unexpected error
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  /* ======================
     CREATE PROFESSOR
  ======================= */
  async createProfessor(dto: CreateProfessorDto) {
    try {
      await this.checkDuplicates(dto.cnic);

      const verifyToken = uuidv4();
      const users = await this.getAllUsers();

      const professor = new this.userModel({
        ...dto,
        role: 'proff',
        password: await this.hashPassword(dto.password),
        verifyToken,
        isQrScanned: false,
        specialId: `PROF-${dto.cnic.slice(-4)}-${users.length + 1}`,
      });

      await professor.save();

      return {
        message: 'Professor created successfully',
        user: this.sanitizeUser(professor),
        qrToken: verifyToken,
      };
    } catch (error) {
      // Mongoose validation error (required fields, enum, etc.)
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map((e: any) => e.message);
        throw new BadRequestException({
          message: 'Validation failed',
          errors: messages,
        });
      }

      // MongoDB duplicate key (unique constraint)
      if (error.code === 11000) {
        const field = Object.keys(error.keyValue)[0];
        const value = error.keyValue[field];
        throw new ConflictException(`${field} '${value}' already exists`);
      }

      // Re-throw known NestJS HTTP exceptions (from checkDuplicates, etc.)
      if (error instanceof HttpException) throw error;

      // Unexpected error
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  /* ======================
     CREATE STAFF
  ======================= */
  async createStaff(dto: CreateStaffDto) {
    await this.checkDuplicates(dto.cnic);

    const verifyToken = uuidv4();

    const staff = new this.userModel({
      ...dto,
      role: 'staff',
      password: await this.hashPassword(dto.password),
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

  async getLoggedInUser(id: string) {
    const me = await this.userModel.findById(id);

    if (!me) {
      throw new NotFoundException('User not found');
    }
    return {
      user: this.sanitizeUser(me),
    };
  }

  /* ======================
     HELPER: CHECK DUPLICATES
  ======================= */
  private async checkDuplicates(cnic: string) {
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
