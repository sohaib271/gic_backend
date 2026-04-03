import { Module } from '@nestjs/common';
import { AttendenceController } from './attendence.controller';
import { AttendenceService } from './attendence.service';
import { Class, ClassSchema } from 'src/class/schema/class.schema';
import { AuthModule } from 'src/auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/user/schema/user.schema';

@Module({
  imports:[AuthModule,MongooseModule.forFeature([{name:Class.name,schema:ClassSchema},{name:User.name,schema:UserSchema}])],
  controllers: [AttendenceController],
  providers: [AttendenceService]
})
export class AttendenceModule {}
