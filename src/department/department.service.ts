import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Department, DepartmentDocument } from './schema/department.schema';
import { CreateDepartmentDto } from './dto/CreateDepartment.dto';

@Injectable()
export class DepartmentService {
  constructor(
    @InjectModel(Department.name)
    private departmentModel: Model<DepartmentDocument>,
  ) {}

  /* ======================
     CREATE DEPARTMENT
  ======================= */
  async createDepartment(dto: CreateDepartmentDto) {
    // Check if department name already exists
    const existingDept = await this.departmentModel.findOne({
      name: dto.name,
    });

    if (existingDept) {
      throw new ConflictException('Department name already exists');
    }

    const department = new this.departmentModel(dto);
    await department.save();

    return {
      message: 'Department created successfully',
      department,
    };
  }

  /* ======================
     GET ALL DEPARTMENTS
  ======================= */
  async getAllDepartments() {
    const departments = await this.departmentModel.find();
    return departments;
  }

  /* ======================
     GET DEPARTMENT BY ID
  ======================= */
  async getDepartmentById(id: string) {
    const department = await this.departmentModel.findById(id);

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  /* ======================
     UPDATE DEPARTMENT
  ======================= */
  async updateDepartment(id: string, updateData: Partial<CreateDepartmentDto>) {
    // Check if updating name to existing name
    if (updateData.name) {
      const existingDept = await this.departmentModel.findOne({
        name: updateData.name,
        _id: { $ne: id },
      });

      if (existingDept) {
        throw new ConflictException('Department name already exists');
      }
    }

    const department = await this.departmentModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true },
    );

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return {
      message: 'Department updated successfully',
      department,
    };
  }

  /* ======================
     DELETE DEPARTMENT
  ======================= */
  async deleteDepartment(id: string) {
    const department = await this.departmentModel.findByIdAndDelete(id);

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return {
      message: 'Department deleted successfully',
      deletedDepartment: department,
    };
  }
}
