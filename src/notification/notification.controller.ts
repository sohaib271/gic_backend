/**
 * 🎮 NOTIFICATION CONTROLLER (REST API Endpoints)
 * ================================================
 *
 * Purpose:
 * - Expose HTTP endpoints for notification operations
 * - Flutter app will call these APIs
 *
 * Authentication:
 * - All endpoints require JWT token in Authorization header
 * - User ID extracted from token (not from request body)
 *
 * API Summary:
 * GET  /notifications              - Get user's notifications
 * PATCH /notifications/read/:id     - Mark single as read
 * PATCH /notifications/read-all     - Mark all as read
 * DELETE /notifications/:id         - Delete single notification
 * DELETE /notifications/read        - Delete all read notifications
 * GET  /notifications/unread-count  - Get unread count
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '../others-stuff/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import {
  CreateNotificationDto,
  GetNotificationsDto,
} from './notification.dto';

@Controller('notifications')
@UseGuards(AuthGuard) // All routes require authentication
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  // ============================================================
  // GET /notifications
  // Get all notifications for the logged-in user
  // ============================================================

  /**
   * Query Parameters:
   * - type: Filter by type (announcement, attendance, qr, class, general)
   * - isRead: Filter by read status (true/false)
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 20)
   *
   * Response:
   * {
   *   notifications: [...],
   *   total: 50,
   *   unreadCount: 5,
   *   page: 1,
   *   limit: 20
   * }
   */
  @Get()
  async getNotifications(
    @Request() req,
    @Query() query: GetNotificationsDto,
  ) {
    // Get userId from JWT token (set by AuthGuard as 'sub')
    const userId = req.user.sub;

    return this.notificationService.getForUser(userId, query);
  }

  // ============================================================
  // PATCH /notifications/read/:id
  // Mark a single notification as read
  // ============================================================

  /**
   * Path Parameters:
   * - id: Notification ID to mark as read
   *
   * Response:
   * {
   *   message: "Notification marked as read",
   *   notification: { ... }
   * }
   */
  @Patch('read/:id')
  async markAsRead(@Request() req, @Param('id') id: string) {
    const userId = req.user.sub;

    const notification = await this.notificationService.markAsRead(id, userId);

    return {
      message: 'Notification marked as read',
      notification,
    };
  }

  // ============================================================
  // PATCH /notifications/read-all
  // Mark ALL notifications as read for the user
  // ============================================================

  /**
   * Response:
   * {
   *   message: "All notifications marked as read",
   *   count: 10
   * }
   */
  @Patch('read-all')
  async markAllAsRead(@Request() req) {
    const userId = req.user.sub;

    const count = await this.notificationService.markAllAsRead(userId);

    return {
      message: 'All notifications marked as read',
      count,
    };
  }

  // ============================================================
  // DELETE /notifications/:id
  // Delete a single notification
  // ============================================================

  /**
   * Path Parameters:
   * - id: Notification ID to delete
   *
   * Response:
   * {
   *   message: "Notification deleted"
   * }
   */
  @Delete(':id')
  async delete(@Request() req, @Param('id') id: string) {
    const userId = req.user.sub;

    await this.notificationService.delete(id, userId);

    return {
      message: 'Notification deleted',
    };
  }

  // ============================================================
  // DELETE /notifications/read
  // Delete all READ notifications (keep unread)
  // ============================================================

  /**
   * Response:
   * {
   *   message: "Read notifications deleted",
   *   count: 5
   * }
   */
  @Delete('read')
  async deleteRead(@Request() req) {
    const userId = req.user.sub;

    const count = await this.notificationService.deleteRead(userId);

    return {
      message: 'Read notifications deleted',
      count,
    };
  }

  // ============================================================
  // GET /notifications/unread-count
  // Get count of unread notifications (for badge)
  // ============================================================

  /**
   * Response:
   * {
   *   unreadCount: 5
   * }
   */
  @Get('unread-count')
  async getUnreadCount(@Request() req) {
    const userId = req.user.sub;

    const unreadCount = await this.notificationService.getUnreadCount(userId);

    return { unreadCount };
  }
}
