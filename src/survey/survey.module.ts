import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SurveyService } from './survey.service';
import { SurveyController } from './survey.controller';
import { Survey, SurveySchema } from './schema/survey.schema';
import {
  SurveyResponse,
  SurveyResponseSchema,
} from './schema/survey-response.schema';
import { User, UserSchema } from 'src/user/schema/user.schema';
import { Class, ClassSchema } from 'src/class/schema/class.schema';
import { AuthModule } from 'src/auth/auth.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [
    AuthModule,
    UserModule,
    MongooseModule.forFeature([
      { name: Survey.name, schema: SurveySchema },
      { name: SurveyResponse.name, schema: SurveyResponseSchema },
      { name: User.name, schema: UserSchema },
      { name: Class.name, schema: ClassSchema },
    ]),
  ],
  providers: [SurveyService],
  controllers: [SurveyController],
})
export class SurveyModule {}