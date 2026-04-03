import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Class, ClassDocument } from 'src/class/schema/class.schema';
import { Attendance, AttendenceDocument } from './schema/attendence.schema';
import { CreateAttendenceDto } from './dto/attendence.dto';

@Injectable()
export class AttendenceService {
  constructor(
    @InjectModel(Class.name) private classModel: Model<ClassDocument>,
    @InjectModel(Attendance.name) private attendenceModel: Model<AttendenceDocument>
  ) {}
  
  async markAttendence(dto:CreateAttendenceDto){

  }
}
