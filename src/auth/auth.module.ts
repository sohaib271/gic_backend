// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategy/jwt.strategy';

import { User, UserSchema } from 'src/user/schema/user.schema';

@Module({
  imports: [
    // User model
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),

    // JWT setup
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-key',
      signOptions: {
        expiresIn: '1d',
      },
    }),
  ],

  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],

  exports: [AuthService],
})
export class AuthModule {}
