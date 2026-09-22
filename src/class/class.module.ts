import { Module } from '@nestjs/common';
import { ClassService } from './class.service';
import { AuthModule } from 'src/auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Class, ClassSchema } from './schema/class.schema';
import { ClassController } from './class.controller';
import { User, UserSchema } from 'src/user/schema/user.schema';
import { StruckOff, StruckOffSchema } from './schema/struckoff.schema';
import { NotificationModule } from 'src/notification/notification.module';


@Module({
  imports:[AuthModule,NotificationModule,MongooseModule.forFeature([{name:Class.name,schema:ClassSchema},{name:User.name,schema:UserSchema},{name:StruckOff.name,schema:StruckOffSchema}])],
  providers: [ClassService],
  controllers: [ClassController]
})
export class ClassModule {}
