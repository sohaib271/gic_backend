/**
 * 🔌 NOTIFICATION GATEWAY (Socket.io WebSocket Server)
 * ======================================================
 *
 * Purpose:
 * - Real-time communication between server and Flutter app
 * - Send instant notifications when app is open
 *
 * How it works:
 * 1. Flutter app connects to this gateway on app start
 * 2. App sends "join" event with userId
 * 3. Server puts user in their own "room" (like a private channel)
 * 4. When we want to notify a user, we emit to their specific room
 * 5. ONLY that user receives the notification (others don't)
 *
 * Key Concepts:
 * - Rooms: Private channels for each user (user:USER_ID)
 * - Namespaces: /notifications (our gateway path)
 * - Events: join, leave, new_notification
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SocketJoinDto, SocketNotificationPayload } from './notification.dto';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  // Port for Socket.io (separate from HTTP)
  // Flutter app will connect to: http://YOUR_SERVER:3001
  cors: {
    origin: '*', // Allow all origins (change for production)
  },
  namespace: '/notifications', // URL: /notifications
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  // ============================================================
  // SERVER INSTANCE
  // ============================================================

  @WebSocketServer()
  server: Server;

  // Logger for debugging
  private logger: Logger = new Logger('NotificationGateway');

  // ============================================================
  // STORE CONNECTED USERS
  // ============================================================

  /**
   * Map of userId -> socketId
   * Used to track which socket belongs to which user
   */
  private userSockets: Map<string, string> = new Map();

  // ============================================================
  // CONNECTION: User connects to Socket.io
  // Called when Flutter app opens and connects
  // ============================================================

  handleConnection(client: Socket) {
    this.logger.log(`🔌 Client connected: ${client.id}`);
  }

  // ============================================================
  // DISCONNECTION: User disconnects (app closed/minimized)
  // ============================================================

  handleDisconnect(client: Socket) {
    this.logger.log(`🔌 Client disconnected: ${client.id}`);

    // Remove from our tracking map
    // We need to find and remove this client from userSockets
    for (const [userId, socketId] of this.userSockets.entries()) {
      if (socketId === client.id) {
        this.userSockets.delete(userId);
        this.logger.log(`👤 User ${userId} disconnected`);
        break;
      }
    }
  }

  // ============================================================
  // JOIN: User joins their personal room
  // Called when Flutter app starts
  // ============================================================

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SocketJoinDto,
  ) {
    const { userId } = data;

    // Store this user's socket
    this.userSockets.set(userId, client.id);

    // Join user's personal room
    // Room name format: "user:USER_ID"
    // Example: "user:60d5ec49f1b2c8a123456789"
    client.join(`user:${userId}`);

    this.logger.log(`👤 User ${userId} joined room: user:${userId}`);

    // Confirm join to the client
    client.emit('joined', {
      success: true,
      message: `Joined room: user:${userId}`,
      room: `user:${userId}`,
    });
  }

  // ============================================================
  // LEAVE: User leaves their room (logout)
  // ============================================================

  @SubscribeMessage('leave')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SocketJoinDto,
  ) {
    const { userId } = data;

    // Remove from tracking
    this.userSockets.delete(userId);

    // Leave the room
    client.leave(`user:${userId}`);

    this.logger.log(`👤 User ${userId} left room: user:${userId}`);

    client.emit('left', {
      success: true,
      message: `Left room: user:${userId}`,
    });
  }

  // ============================================================
  // 📤 SEND TO SPECIFIC USER
  // This is the MAIN method to send notifications!
  // Call this from NotificationService
  // ============================================================

  /**
   * Send notification to a specific user only
   * @param userId - Target user's ID
   * @param payload - Notification data
   *
   * Usage in service:
   * this.notificationGateway.sendToUser(userId, notificationData);
   */
  sendToUser(userId: string, payload: SocketNotificationPayload) {
    // Emit to user's specific room
    this.server.to(`user:${userId}`).emit('new_notification', payload);

    this.logger.log(
      `📤 Notification sent to user:${userId} - ${payload.title}`,
    );
  }

  // ============================================================
  // 📤 SEND TO MULTIPLE USERS (Bulk)
  // For announcements: notify multiple students at once
  // ============================================================

  /**
   * Send notification to multiple users
   * @param userIds - Array of target user IDs
   * @param payload - Notification data
   *
   * Usage in service:
   * this.notificationGateway.sendToUsers([userId1, userId2, userId3], data);
   */
  sendToUsers(userIds: string[], payload: SocketNotificationPayload) {
    // Create array of rooms
    const rooms = userIds.map((id) => `user:${id}`);

    // Emit to all rooms
    this.server.to(rooms).emit('new_notification', payload);

    this.logger.log(
      `📤 Bulk notification sent to ${userIds.length} users - ${payload.title}`,
    );
  }

  // ============================================================
  // 📤 BROADCAST TO ALL CONNECTED USERS
  // For system-wide announcements
  // ============================================================

  /**
   * Send to all connected clients
   * Use sparingly - only for critical system alerts
   */
  broadcast(payload: SocketNotificationPayload) {
    this.server.emit('new_notification', payload);

    this.logger.log(`📢 Broadcast notification sent - ${payload.title}`);
  }

  // ============================================================
  // 📤 NOTIFICATION READ EVENT
  // Tell client that a notification was marked as read
  // ============================================================

  notifyRead(userId: string, notificationId: string) {
    this.server.to(`user:${userId}`).emit('notification_read', {
      notificationId,
      isRead: true,
      readAt: new Date(),
    });
  }

  // ============================================================
  // 📤 NOTIFICATION DELETED EVENT
  // Tell client that a notification was deleted
  // ============================================================

  notifyDeleted(userId: string, notificationId: string) {
    this.server.to(`user:${userId}`).emit('notification_deleted', {
      notificationId,
    });
  }

  // ============================================================
  // 🔍 UTILITY: Check if user is online
  // ============================================================

  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  // ============================================================
  // 🔍 UTILITY: Get online users count
  // ============================================================

  getOnlineUsersCount(): number {
    return this.userSockets.size;
  }
}
