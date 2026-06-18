/**
 * 🔔 NOTIFICATION SERVICE (Business Logic)
 * ==========================================
 *
 * Purpose:
 * - All notification-related operations happen here
 * - Save to DB, send real-time events, manage read status
 *
 * Key Methods:
 * 1. create() - Create notification for ONE user
 * 2. createBulk() - Create notifications for MULTIPLE users
 * 3. sendToClass() - Send to all students of specific class(es)
 * 4. getForUser() - Get notifications for a user (with pagination)
 * 5. markAsRead() - Mark single notification as read
 * 6. markAllAsRead() - Mark all user's notifications as read
 * 7. delete() - Delete a notification
 * 8. deleteRead() - Delete all read notifications
 * 9. getUnreadCount() - Get count of unread notifications
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from './notification.schema';
import {
  CreateNotificationDto,
  CreateBulkNotificationDto,
  GetNotificationsDto,
  NotificationResponseDto,
  SocketNotificationPayload,
} from './notification.dto';
import { NotificationGateway } from './notification.gateway';

@Injectable()
export class NotificationService {
  private logger = new Logger('NotificationService');

  constructor(
    // Inject the Notification model (MongoDB collection)
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,

    // Inject the Socket.io gateway for real-time events
    private notificationGateway: NotificationGateway,
  ) {}

  // ============================================================
  // 1. CREATE NOTIFICATION (For ONE user)
  // ============================================================

  /**
   * Create notification for a single user
   * Saves to DB + sends real-time event via Socket.io
   *
   * @param dto - Notification data
   * @returns Created notification
   */
  async create(dto: CreateNotificationDto): Promise<NotificationDocument> {
    // 1a. Save to database
    const notification = await this.notificationModel.create({
      userId: new Types.ObjectId(dto.userId),
      senderId: new Types.ObjectId(dto.senderId),
      senderName: dto.senderName,
      senderRole: dto.senderRole,
      type: dto.type,
      title: dto.title,
      message: dto.message,
      data: dto.data || {},
      classNames: dto.classNames || [],
      isRead: false,
    });

    this.logger.log(
      `✅ Created notification for user ${dto.userId}: ${dto.title}`,
    );

    // 1b. Send real-time event via Socket.io
    this.sendRealTimeNotification(dto.userId, notification);

    return notification;
  }

  // ============================================================
  // 2. CREATE BULK NOTIFICATIONS (For MULTIPLE users)
  // ============================================================

  /**
   * Create notifications for multiple users at once
   * Used when admin sends announcement to entire class
   *
   * @param dto - Bulk notification data with userIds array
   * @returns Number of notifications created
   */
  async createBulk(dto: CreateBulkNotificationDto): Promise<number> {
    // 2a. Prepare bulk insert data
    const notificationsToInsert = dto.userIds.map((userId) => ({
      userId: new Types.ObjectId(userId),
      senderId: new Types.ObjectId(dto.senderId),
      senderName: dto.senderName,
      senderRole: dto.senderRole,
      type: dto.type,
      title: dto.title,
      message: dto.message,
      data: dto.data || {},
      classNames: dto.classNames || [],
      isRead: false,
    }));

    // 2b. Bulk insert to database (faster than individual inserts)
    const result = await this.notificationModel.insertMany(
      notificationsToInsert,
    );

    this.logger.log(
      `✅ Created ${result.length} bulk notifications for type: ${dto.type}`,
    );

    // 2c. Send real-time events to ALL users
    // We need to send to each user their own notification record
    for (const userId of dto.userIds) {
      // Find the notification for this user
      const userNotification = result.find(
        (n) => n.userId.toString() === userId,
      );

      if (userNotification) {
        this.sendRealTimeNotification(userId, userNotification);
      }
    }

    return result.length;
  }

  // ============================================================
  // 3. SEND TO CLASS STUDENTS (Target specific class)
  // ============================================================

  /**
   * Send notification to all students of specified class(es)
   * This is the MAIN method for class-based announcements!
   *
   * @param classNames - Array of class names (e.g., ["ICS-2426-PB7-I"])
   * @param senderInfo - Who is sending (admin/teacher)
   * @param title - Notification title
   * @param message - Notification message
   * @param type - Notification type
   * @param data - Extra data (announcementId, etc.)
   *
   * HOW IT WORKS:
   * 1. UserModel se students find karo jinki className match kare
   * 2. Har student ko notification create karo
   * 3. Har student ko socket event bhejo
   */
  async sendToClass(
    classNames: string[],
    senderInfo: {
      senderId: string;
      senderName: string;
      senderRole: string;
    },
    title: string,
    message: string,
    type: string = 'announcement',
    data: Record<string, any> = {},
  ): Promise<{ notificationsCreated: number; studentsNotified: number }> {
    // 3a. Find all students of these classes
    // We need to dynamically get UserModel to avoid circular dependency
    // Import User schema directly
    const userSchemaPath = require.resolve('../user/schema/user.schema');
    const userModule = await import(userSchemaPath);
    const UserModel = this.notificationModel.db.model('User', (userModule.UserSchema as any));

    // Find students whose className matches any of the target classes
    const students = await UserModel.find({
      className: { $in: classNames },
      role: 'student', // Sirf students, not teachers/admins
    });

    if (students.length === 0) {
      this.logger.warn(`⚠️ No students found for classes: ${classNames.join(', ')}`);
      return { notificationsCreated: 0, studentsNotified: 0 };
    }

    // 3b. Extract student IDs
    const studentIds = students.map((s) => s._id.toString());

    // 3c. Create bulk notifications
    const notificationsToInsert = studentIds.map((userId) => ({
      userId: new Types.ObjectId(userId),
      senderId: new Types.ObjectId(senderInfo.senderId),
      senderName: senderInfo.senderName,
      senderRole: senderInfo.senderRole,
      type,
      title,
      message,
      data,
      classNames,
      isRead: false,
    }));

    // 3d. Save to database
    const savedNotifications = await this.notificationModel.insertMany(
      notificationsToInsert,
    );

    // 3e. Send real-time notifications to each student
    for (let i = 0; i < studentIds.length; i++) {
      const userId = studentIds[i];
      const notification = savedNotifications[i];

      // Send via Socket.io
      this.sendRealTimeNotification(userId, notification);

      // Also send via Firebase (if configured - for future)
      // await this.firebaseService.sendToUser(userId, { title, body: message });
    }

    this.logger.log(
      `🎯 Class notification sent to ${students.length} students for classes: ${classNames.join(', ')}`,
    );

    return {
      notificationsCreated: savedNotifications.length,
      studentsNotified: students.length,
    };
  }

  // ============================================================
  // 4. GET NOTIFICATIONS FOR USER (with pagination)
  // ============================================================

  /**
   * Get all notifications for a specific user
   * Sorted by newest first, with pagination
   *
   * @param userId - Target user ID
   * @param query - Filter options (type, isRead, page, limit)
   * @returns Paginated notifications with total count
   */
  async getForUser(
    userId: string,
    query: GetNotificationsDto,
  ): Promise<{
    notifications: NotificationDocument[];
    total: number;
    unreadCount: number;
    page: number;
    limit: number;
  }> {
    // Build filter query
    const filter: any = { userId: new Types.ObjectId(userId) };

    // Add type filter if provided
    if (query.type) {
      filter.type = query.type;
    }

    // Add isRead filter if provided
    if (query.isRead !== undefined) {
      filter.isRead = query.isRead === 'true';
    }

    // Pagination settings
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;

    // Execute queries in parallel for performance
    const [notifications, total, unreadCount] = await Promise.all([
      // Get paginated notifications
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 }) // Newest first
        .skip(skip)
        .limit(limit)
        .lean(),

      // Get total count
      this.notificationModel.countDocuments(filter),

      // Get unread count (for badge)
      this.notificationModel.countDocuments({
        userId: new Types.ObjectId(userId),
        isRead: false,
      }),
    ]);

    return {
      notifications,
      total,
      unreadCount,
      page,
      limit,
    };
  }

  // ============================================================
  // 5. MARK AS READ (Single notification)
  // ============================================================

  /**
   * Mark a single notification as read
   * Updates DB + notifies client via Socket.io
   *
   * @param notificationId - Notification to mark
   * @param userId - User who owns this notification (for security)
   */
  async markAsRead(
    notificationId: string,
    userId: string,
  ): Promise<NotificationDocument> {
    // 5a. Find and verify ownership
    const notification = await this.notificationModel.findOne({
      _id: new Types.ObjectId(notificationId),
      userId: new Types.ObjectId(userId),
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    // 5b. Update to read
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    // 5c. Notify client via Socket.io
    this.notificationGateway.notifyRead(userId, notificationId);

    this.logger.log(`📖 Notification ${notificationId} marked as read`);

    return notification;
  }

  // ============================================================
  // 6. MARK ALL AS READ
  // ============================================================

  /**
   * Mark all unread notifications as read for a user
   *
   * @param userId - Target user
   * @returns Number of notifications marked as read
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.notificationModel.updateMany(
      {
        userId: new Types.ObjectId(userId),
        isRead: false, // Only unread ones
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      },
    );

    this.logger.log(
      `📖 Marked ${result.modifiedCount} notifications as read for user ${userId}`,
    );

    return result.modifiedCount;
  }

  // ============================================================
  // 7. DELETE SINGLE NOTIFICATION
  // ============================================================

  /**
   * Delete a single notification
   *
   * @param notificationId - Notification to delete
   * @param userId - User who owns this notification
   */
  async delete(notificationId: string, userId: string): Promise<void> {
    const result = await this.notificationModel.deleteOne({
      _id: new Types.ObjectId(notificationId),
      userId: new Types.ObjectId(userId),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Notification not found');
    }

    // Notify client that notification was deleted
    this.notificationGateway.notifyDeleted(userId, notificationId);

    this.logger.log(`🗑️ Notification ${notificationId} deleted`);
  }

  // ============================================================
  // 8. DELETE ALL READ NOTIFICATIONS
  // ============================================================

  /**
   * Delete all read notifications for a user
   * Useful for "Clear read notifications" feature
   *
   * @param userId - Target user
   * @returns Number of notifications deleted
   */
  async deleteRead(userId: string): Promise<number> {
    const result = await this.notificationModel.deleteMany({
      userId: new Types.ObjectId(userId),
      isRead: true, // Only read ones
    });

    this.logger.log(
      `🗑️ Deleted ${result.deletedCount} read notifications for user ${userId}`,
    );

    return result.deletedCount;
  }

  // ============================================================
  // 9. GET UNREAD COUNT
  // ============================================================

  /**
   * Get count of unread notifications for a user
   * Used for notification badge
   *
   * @param userId - Target user
   * @returns Unread count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isRead: false,
    });
  }

  // ============================================================
  // HELPER: Send Real-time notification via Socket.io
  // ============================================================

  /**
   * Internal method to send notification via Socket.io
   * Formats data and calls the gateway
   */
  private sendRealTimeNotification(
    userId: string,
    notification: any,
  ): void {
    // Prepare payload for Socket.io
    const payload: SocketNotificationPayload = {
      notificationId: notification._id.toString(),
      type: notification.type,
      title: notification.title,
      message: notification.message,
      senderName: notification.senderName,
      senderRole: notification.senderRole,
      data: notification.data || {},
      classNames: notification.classNames || [],
      createdAt: notification.createdAt,
      isRead: false,
    };

    // Send to user's room
    this.notificationGateway.sendToUser(userId, payload);
  }
}
