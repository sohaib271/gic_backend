/**
 * 📝 NOTIFICATION DTOs (Data Transfer Objects)
 * ============================================
 * DTOs define the shape of data coming IN to our API
 * They also help with validation and documentation
 */

import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  IsObject,
} from 'class-validator';

// ============================================================
// 1. CREATE NOTIFICATION DTO
// Used when: Creating a new notification for ONE user
// ============================================================

export class CreateNotificationDto {
  @IsString()
  @IsNotEmpty()
  userId: string; // User jisko notification jayegi

  @IsString()
  @IsNotEmpty()
  senderId: string; // User jisne notification bheji

  @IsString()
  @IsNotEmpty()
  senderName: string;

  @IsString()
  @IsNotEmpty()
  senderRole: string;

  @IsEnum(['announcement', 'attendance', 'qr', 'class', 'general'])
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>; // Extra data for navigation

  @IsArray()
  @IsOptional()
  classNames?: string[]; // Target classes
}

// ============================================================
// 2. CREATE BULK NOTIFICATIONS DTO
// Used when: Creating notifications for MULTIPLE users at once
// Example: Admin ne announcement ki, 50 students ko bhejni hai
// ============================================================

export class CreateBulkNotificationDto {
  @IsArray()
  @IsNotEmpty()
  userIds: string[]; // Array of user IDs - sabko bhejni hai

  @IsString()
  @IsNotEmpty()
  senderId: string;

  @IsString()
  @IsNotEmpty()
  senderName: string;

  @IsString()
  @IsNotEmpty()
  senderRole: string;

  @IsEnum(['announcement', 'attendance', 'qr', 'class', 'general'])
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>;

  @IsArray()
  @IsOptional()
  classNames?: string[];
}

// ============================================================
// 3. GET NOTIFICATIONS QUERY DTO
// Used when: User fetches their notifications
// ============================================================

export class GetNotificationsDto {
  @IsOptional()
  @IsString()
  type?: string; // Filter by type (announcement, attendance, etc.)

  @IsOptional()
  @IsString()
  isRead?: string; // Filter: "true" or "false"

  @IsOptional()
  @IsString()
  page?: string; // Pagination - page number

  @IsOptional()
  @IsString()
  limit?: string; // Pagination - items per page
}

// ============================================================
// 4. NOTIFICATION RESPONSE DTO
// Used when: Sending notification data OUT to client
// ============================================================

export class NotificationResponseDto {
  _id: string;
  userId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, any>;
  classNames: string[];
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

// ============================================================
// 5. SOCKET JOIN DTO
// Used when: User connects via Socket.io
// ============================================================

export class SocketJoinDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}

// ============================================================
// 6. SOCKET NOTIFICATION PAYLOAD
// This is what we send to client via Socket.io
// ============================================================

export class SocketNotificationPayload {
  notificationId: string;
  type: string;
  title: string;
  message: string;
  senderName: string;
  senderRole: string;
  data: Record<string, any>;
  classNames: string[];
  createdAt: Date;
  isRead: boolean;
}
