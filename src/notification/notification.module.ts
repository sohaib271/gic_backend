/**
 * 📦 NOTIFICATION MODULE
 * ======================
 *
 * Purpose:
 * - Bundle all notification-related components together
 * - Register with NestJS dependency injection
 *
 * Components registered:
 * - NotificationGateway (Socket.io)
 * - NotificationService (Business logic)
 * - NotificationController (REST API)
 * - NotificationSchema (MongoDB)
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { Notification, NotificationSchema } from './notification.schema';
import { DeviceToken, DeviceTokenSchema } from './device-token.schema';
import { FirebaseService } from './firebase.service';
import { User, UserSchema } from 'src/user/schema/user.schema';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    // AuthModule is needed because AuthGuard (JWT) requires UserModel
    AuthModule,
    ConfigModule,
    // Register the Notification schema with MongoDB
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: DeviceToken.name, schema: DeviceTokenSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [NotificationController],
  providers: [
    // Gateway must be a provider (for Socket.io)
    NotificationGateway,
    // Service for business logic
    NotificationService,
    // Firebase for FCM push notifications
    FirebaseService,
  ],
  exports: [
    // Export service so other modules can use it
    // Example: AnnouncementModule can send notifications
    NotificationService,
    // Export gateway so other modules can send real-time events
    NotificationGateway,
    // Export FirebaseService for FCM push
    FirebaseService,
  ],
})
export class NotificationModule {}
