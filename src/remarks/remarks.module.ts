import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RemarksController } from './remarks.controller';
import { RemarksService } from './remarks.service';
import { Remark, RemarkSchema } from './schema/remark.schema';
import { User, UserSchema } from '../user/schema/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Remark.name, schema: RemarkSchema },
      { name: User.name, schema: UserSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'default-secret',
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [RemarksController],
  providers: [RemarksService],
  exports: [RemarksService],
})
export class RemarksModule {}