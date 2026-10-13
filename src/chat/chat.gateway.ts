/**
 * 💬 CHAT GATEWAY (Socket.io WebSocket Server)
 * ==========================================
 *
 * Namespace: /chat
 *
 * Events:
 * - join             : User registers socket with their userId → joins "user:USER_ID" room
 * - leave            : User leaves room (logout)
 * - send_message     : { senderId, receiverId, text, replyToMessageId? } → saves + delivers to receiver's room
 * - delete_message   : { userId, messageId } → soft-deletes the message, notifies both
 * - typing           : { userId, conversationId, isTyping } → typing indicator
 * - message_read     : { userId, conversationId } → marks messages read, notifies both
 *
 * Delivered to clients:
 * - joined                : confirm join
 * - new_message           : new incoming message (sent to both sender & receiver rooms)
 * - message_deleted       : { conversationId, messageId, deletedBy, deletedAt } → sent to all participants
 * - messages_read         : conversation read status updated
 * - typing                : peer typing indicator
 * - chat_error            : validation/rule errors (e.g. student→student blocked)
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import {
  SocketDeleteMessageDto,
  SocketReadMessagesDto,
  SocketSendMessageDto,
  SocketTypingDto,
} from './chat.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private logger: Logger = new Logger('ChatGateway');

  @WebSocketServer()
  server: Server;

  private socketUser: Map<string, string> = new Map();

  constructor(private chatService: ChatService) {}

  handleConnection(client: Socket) {
    this.logger.log(`💬 Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const userId = this.socketUser.get(client.id);
    if (userId) {
      this.socketUser.delete(client.id);
      this.logger.log(`💬 User ${userId} disconnected`);
    }
  }

  @SubscribeMessage('join')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() data: { userId: string }) {
    const userId = data?.userId;
    if (!userId) {
      client.emit('chat_error', { message: 'userId is required' });
      return;
    }

    this.socketUser.set(client.id, userId);
    client.join(`user:${userId}`);

    this.logger.log(`💬 User ${userId} joined chat room user:${userId}`);

    client.emit('joined', {
      success: true,
      userId,
      room: `user:${userId}`,
    });
  }

  @SubscribeMessage('leave')
  handleLeave(@ConnectedSocket() client: Socket, @MessageBody() data: { userId: string }) {
    const userId = data?.userId;
    if (userId) {
      this.socketUser.delete(client.id);
      client.leave(`user:${userId}`);
      client.emit('left', { success: true, userId });
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SocketSendMessageDto,
  ) {
    try {
      const registeredUserId = this.socketUser.get(client.id);
      if (!registeredUserId) {
        client.emit('chat_error', { message: 'Join before sending messages' });
        return;
      }
      if (registeredUserId !== data?.senderId) {
        client.emit('chat_error', { message: 'senderId mismatch with socket session' });
        return;
      }

      const sender = await this.chatService.getRawUser(data.senderId);
      const result = await this.chatService.createMessage(
        sender,
        data.receiverId,
        data.text,
        data.replyToMessageId,
      );

      const payload = {
        conversation: result.conversation,
        message: result.message,
        sender: {
          _id: sender._id,
          name: sender.name,
          lastName: sender.lastName,
          role: sender.role,
        },
      };

      this.server.to(`user:${data.senderId}`).emit('new_message', payload);
      this.server.to(`user:${data.receiverId}`).emit('new_message', payload);

      this.logger.log(
        `💬 Message sent: ${data.senderId} → ${data.receiverId}`,
      );
    } catch (error) {
      const message = error?.message || 'Failed to send message';
      this.logger.error(`💬 send_message failed: ${message}`);
      client.emit('chat_error', { message });
    }
  }

  @SubscribeMessage('delete_message')
  async handleDeleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SocketDeleteMessageDto,
  ) {
    try {
      const registeredUserId = this.socketUser.get(client.id);
      if (!registeredUserId || registeredUserId !== data?.userId) {
        client.emit('chat_error', {
          message: 'userId mismatch with socket session',
        });
        return;
      }

      const result = await this.chatService.deleteMessage(
        data.userId,
        data.messageId,
      );

      const payload = {
        conversationId: result.conversationId,
        messageId: result.messageId,
        deletedBy: result.deletedBy,
        deletedAt: result.deletedAt,
      };

      // Both participants' connected devices get the tombstone in one shot.
      for (const participantId of result.participantUserIds) {
        this.server.to(`user:${participantId}`).emit('message_deleted', payload);
      }

      this.logger.log(`💬 Message deleted: ${data.messageId}`);
    } catch (error) {
      const message = error?.message || 'Failed to delete message';
      this.logger.error(`💬 delete_message failed: ${message}`);
      client.emit('chat_error', { message });
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SocketTypingDto,
  ) {
    const senderUserId = this.socketUser.get(client.id);
    if (!senderUserId || !data?.conversationId) return;

    this.server
      .to(`user:${data.userId}`)
      .emit('typing', { conversationId: data.conversationId, isTyping: !!data.isTyping });
  }

  @SubscribeMessage('message_read')
  async handleRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SocketReadMessagesDto,
  ) {
    try {
      const registeredUserId = this.socketUser.get(client.id);
      if (!registeredUserId || registeredUserId !== data?.userId) {
        client.emit('chat_error', { message: 'userId mismatch with socket session' });
        return;
      }

      const result = await this.chatService.markAsRead(data.userId, data.conversationId);

      this.notifyMessagesRead(
        data.conversationId,
        data.userId,
        result.participantUserIds,
      );

      this.logger.log(`💬 User ${data.userId} read conversation ${data.conversationId}`);
    } catch (error) {
      const message = error?.message || 'Failed to mark as read';
      this.logger.error(`💬 message_read failed: ${message}`);
      client.emit('chat_error', { message });
    }
  }

  /**
   * Broadcasts a read-status update to every participant's connected devices.
   * Shared by the REST `/read` endpoint and the socket `message_read` handler,
   * so the message sender learns their messages were read either way.
   */
  public notifyMessagesRead(
    conversationId: string,
    userId: string,
    participantUserIds: string[],
  ) {
    const payload = {
      conversationId,
      userId,
      readAt: new Date(),
    };
    for (const participantId of participantUserIds) {
      this.server.to(`user:${participantId}`).emit('messages_read', payload);
    }
  }
}