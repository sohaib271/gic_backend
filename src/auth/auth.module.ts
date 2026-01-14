// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
// import { JwtStrategy } from './strategy/jwt.strategy';

import { User, UserSchema } from 'src/user/schema/user.schema';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    // User model
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),

    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRY'),
        },
      }),
    }),
  ],

  controllers: [AuthController],
  providers: [AuthService],

  exports: [AuthService,JwtModule],
})
export class AuthModule {}

 