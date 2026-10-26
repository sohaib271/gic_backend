import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from './conversation.schema';
import { Message, MessageDocument, MessageReplyTo } from './message.schema';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { Class, ClassDocument } from 'src/class/schema/class.schema';
import { UserRoleEnum } from 'src/user/enum/UserRole.enum';
import { NotificationService } from 'src/notification/notification.service';

const USER_SELECT =
  'name lastName specialId role image department isHod isPrincipal designation';

@Injectable()
export class ChatService {
  private logger: Logger = new Logger('ChatService');

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @InjectModel(Class.name)
    private classModel: Model<ClassDocument>,
    private notificationService: NotificationService,
  ) {}

  async getRawUser(userId: string) {
    const user = await this.userModel.findById(userId).lean();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  canChat(senderRole: string, receiverRole: string): boolean {
    return !(senderRole === UserRoleEnum.STUDENT && receiverRole === UserRoleEnum.STUDENT);
  }

  // ============================================================
  // CONTACTS (discovery)
  // ============================================================

  async getContacts(userId: string, q?: string) {
    const me = await this.getRawUser(userId);
    const search = q && q.trim()
      ? {
          $or: [
            { name: { $regex: q.trim(), $options: 'i' } },
            { lastName: { $regex: q.trim(), $options: 'i' } },
            { specialId: { $regex: q.trim(), $options: 'i' } },
          ],
        }
      : {};

    let merged: UserDocument[] = [];

    if (me.role === UserRoleEnum.STUDENT) {
      const teacherIds = await this.getClassTeachersForStudent(me._id.toString());

      const classTeachers = teacherIds.length
        ? await this.userModel
            .find({ _id: { $in: teacherIds }, isActive: true, ...search })
            .select(USER_SELECT)
            .lean()
        : [];

      const classTeacherIdStrings = teacherIds.map((id) => id.toString());
      const others = await this.userModel
        .find({
          _id: { $nin: [me._id, ...classTeacherIdStrings] },
          isActive: true,
          role: { $in: [UserRoleEnum.PROFF, UserRoleEnum.ADMIN, UserRoleEnum.STAFF] },
          $or: [
            { role: { $in: [UserRoleEnum.ADMIN, UserRoleEnum.STAFF] } },
            { role: UserRoleEnum.PROFF, department: me.department },
          ],
          ...search,
        })
        .select(USER_SELECT)
        .lean();

      merged = this.dedupe([...classTeachers, ...others]);
    } else if (me.role === UserRoleEnum.PROFF) {
      const classes = await this.classModel
        .find({ 'assignes.teacherId': me._id })
        .lean();

      const studentIds = new Set<string>();
      for (const c of classes) {
        for (const s of c.classStudents || []) studentIds.add(s.toString());
      }

      const students = studentIds.size
        ? await this.userModel
            .find({
              _id: { $in: [...studentIds] },
              isActive: true,
              ...search,
            })
            .select(USER_SELECT)
            .lean()
        : [];

      const studentIdStrings = [...studentIds];
      const colleagues = await this.userModel
        .find({
          _id: { $nin: [...studentIdStrings, me._id.toString()] },
          isActive: true,
          role: { $in: [UserRoleEnum.PROFF, UserRoleEnum.ADMIN, UserRoleEnum.STAFF] },
          ...search,
        })
        .select(USER_SELECT)
        .lean();

      merged = this.dedupe([...students, ...colleagues]);
    } else {
      merged = await this.userModel
        .find({ _id: { $ne: me._id }, isActive: true, ...search })
        .select(USER_SELECT)
        .lean();
    }

    return merged;
  }

  private async getClassTeachersForStudent(studentId: string): Promise<Types.ObjectId[]> {
    const classes = await this.classModel
      .find({ classStudents: studentId })
      .lean();

    const teacherIds = new Set<string>();
    for (const c of classes) {
      for (const a of c.assignes || []) teacherIds.add(a.teacherId.toString());
    }
    return [...teacherIds].map((id) => new Types.ObjectId(id));
  }

  private dedupe(users: any[]): any[] {
    const seen = new Set<string>();
    const result: any[] = [];
    for (const u of users) {
      const key = u._id.toString();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(u);
      }
    }
    return result;
  }

  // ============================================================
  // CONVERSATIONS
  // ============================================================

  /**
   * Finds the direct conversation between two users or creates it.
   *
   * Split out of [getOrCreateConversation] so the socket send path can reuse
   * it without re-fetching the receiver, which that method owns.
   */
  private async findOrCreateConversationPair(meIdRaw: string, otherIdRaw: string) {
    const meId = new Types.ObjectId(meIdRaw);
    const otherId = new Types.ObjectId(otherIdRaw);

    const conversation = await this.conversationModel
      .findOne({
        type: 'direct',
        participants: { $size: 2, $all: [meId, otherId] },
      })
      .lean();

    if (conversation) return conversation;

    return this.conversationModel.create({
      type: 'direct',
      creatorId: meId,
      participants: [meId, otherId],
    });
  }

  async getOrCreateConversation(user: any, receiverId: string) {
    // ROLE check _and_ the otherUser view both come from fields inside
    // USER_SELECT, so a single lean fetch is enough — it used to read the
    // receiver document twice per call.
    const receiver = await this.userModel
      .findById(receiverId)
      .select(USER_SELECT)
      .lean();
    if (!receiver) throw new NotFoundException('Receiver not found');

    if (!this.canChat(user.role, receiver.role)) {
      throw new ForbiddenException('Students are not allowed to chat with other students');
    }

    const conversation = await this.findOrCreateConversationPair(
      user._id.toString(),
      receiverId,
    );

    return {
      conversation: this.toConversationView(conversation, receiver),
    };
  }

  async getMyConversations(userId: string) {
    const me = new Types.ObjectId(userId);
    const conversations = await this.conversationModel
      .find({ participants: me })
      .sort({ updatedAt: -1 })
      .lean();

    if (!conversations.length) return [];

    const userIds = new Set<string>();
    const lastMessageIds = new Set<string>();
    for (const c of conversations) {
      for (const p of c.participants) {
        if (p.toString() !== me.toString()) userIds.add(p.toString());
      }
      if (c.lastMessage) lastMessageIds.add(c.lastMessage.toString());
    }

    const [users, lastMessages] = await Promise.all([
      this.userModel.find({ _id: { $in: [...userIds] } }).select(USER_SELECT).lean(),
      this.messageModel.find({ _id: { $in: [...lastMessageIds] } }).lean(),
    ]);

    const userById = new Map(users.map((u) => [u._id.toString(), u]));
    const msgById = new Map(lastMessages.map((m) => [m._id.toString(), m]));

    const result: any[] = [];
    for (const c of conversations) {
      const otherUser = c.participants
        .map((p) => userById.get(p.toString()))
        .find((u) => u);

      const unreadCount = await this.messageModel.countDocuments({
        conversationId: c._id,
        senderId: { $ne: me },
        readBy: { $ne: me },
      });

      const lastMessage = c.lastMessage
        ? msgById.get(c.lastMessage.toString()) || null
        : null;

      // WhatsApp-style: never expose a deleted message as the conversation
      // preview. If the stored last message is deleted, find the previous
      // non-deleted one (or clear the preview entirely).
      let previewMessage = lastMessage;
      if (lastMessage?.deleted) {
        const previous = await this.messageModel
          .findOne({
            conversationId: c._id,
            _id: { $ne: c.lastMessage },
            deleted: { $ne: true },
          })
          .sort({ createdAt: -1 })
          .lean();

        await this.conversationModel.updateOne(
          { _id: c._id },
          {
            lastMessage: previous?._id || null,
            lastMessageText: previous?.text || null,
            lastMessageAt: previous?.createdAt || null,
          },
        );
        previewMessage = previous || null;
        c.lastMessageText = previous?.text || null;
      }

      result.push({
        conversation: this.toConversationView(c, otherUser),
        lastMessage: previewMessage,
        unreadCount,
      });
    }

    return result;
  }

  async getMessages(
    userId: string,
    conversationId: string,
    page = 1,
    limit = 30,
  ) {
    const me = new Types.ObjectId(userId);
    const conversation = await this.conversationModel.findById(conversationId).lean();
    if (!conversation) throw new NotFoundException('Conversation not found');

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === me.toString(),
    );
    if (!isParticipant) {
      throw new ForbiddenException('You are not part of this conversation');
    }

    const skip = (page - 1) * limit;
    const [messages, total] = await Promise.all([
      this.messageModel
        .find({ conversationId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.messageModel.countDocuments({ conversationId }),
    ]);

    return {
      messages: messages
        .reverse()
        .map((m) => this.toMessageView(m as MessageDocument)),
      total,
      page,
      limit,
    };
  }

  async markAsRead(userId: string, conversationId: string) {
    const me = new Types.ObjectId(userId);
    const conversation = await this.conversationModel.findById(conversationId).lean();
    if (!conversation) throw new NotFoundException('Conversation not found');

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === me.toString(),
    );
    if (!isParticipant) {
      throw new ForbiddenException('You are not part of this conversation');
    }

    const result = await this.messageModel.updateMany(
      { conversationId, senderId: { $ne: me }, readBy: { $ne: me } },
      { $addToSet: { readBy: me } },
    );

    return {
      success: true,
      marked: result.modifiedCount,
      conversationId: conversation._id,
      userId,
      // Participants let the caller broadcast the read event to every side,
      // including the message sender whose app otherwise never finds out.
      participantUserIds: conversation.participants.map((p) => p.toString()),
    };
  }

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  async createMessage(
    sender: any,
    receiverId: string,
    text: string,
    replyToMessageId?: string,
  ) {
    // The receiver was re-fetched four times across this method and
    // getOrCreateConversation before delivery. Every fetch is a full DB
    // network round trip between Render and the cluster, and they all sat on
    // the critical path — which is exactly why listeners saw new messages
    // seconds late. One lean fetch now serves the role check and the view.
    const receiver = await this.userModel
      .findById(receiverId)
      .select(USER_SELECT)
      .lean();
    if (!receiver) throw new NotFoundException('Receiver not found');

    if (!this.canChat(sender.role, receiver.role)) {
      throw new ForbiddenException('Students are not allowed to chat with other students');
    }

    const conversation = await this.findOrCreateConversationPair(
      sender._id.toString(),
      receiverId,
    );

    // Reply: snapshot the quoted message at send time (WhatsApp-style), so the
    // quote survives even if the original message is later deleted. Only quotes
    // from the same conversation are accepted; anything else is ignored.
    let replyTo: MessageReplyTo | null = null;
    if (replyToMessageId) {
      const quoted = await this.messageModel.findById(replyToMessageId).lean();
      if (
        quoted &&
        quoted.conversationId.toString() === conversation._id.toString()
      ) {
        const quotedSender = await this.userModel
          .findById(quoted.senderId)
          .lean();
        replyTo = {
          messageId: quoted._id,
          text: quoted.text,
          senderId: quoted.senderId,
          senderName: quotedSender
            ? `${quotedSender.name || ''} ${quotedSender.lastName || ''}`.trim()
            : '',
        };
      }
    }

    const message = await this.messageModel.create({
      conversationId: conversation._id,
      senderId: new Types.ObjectId(sender._id.toString()),
      text: text.trim(),
      replyTo,
      readBy: [new Types.ObjectId(sender._id.toString())],
    });

    await this.conversationModel.updateOne(
      { _id: conversation._id },
      {
        lastMessage: message._id,
        lastMessageText: message.text,
        lastMessageAt: message.createdAt,
      },
    );

    // FCM push to the receiver — push only, no in-app notification record
    this.notificationService
      .sendChatPush({
        receiverId,
        senderId: sender._id.toString(),
        senderName: `${sender.name || ''} ${sender.lastName || ''}`.trim(),
        senderRole: sender.role,
        conversationId: conversation._id.toString(),
        messageText: message.text,
      })
      .catch((err) =>
        this.logger.warn(`Chat push failed: ${err?.message || err}`),
      );

    return {
      conversation: this.toConversationView(conversation, receiver),
      message: this.toMessageView(message),
    };
  }

  // ============================================================
  // DELETE MESSAGE (soft delete)
  // ============================================================

  async deleteMessage(userId: string, messageId: string) {
    const me = new Types.ObjectId(userId);

    const message = await this.messageModel.findById(messageId).lean();
    if (!message) throw new NotFoundException('Message not found');

    if (message.senderId.toString() !== me.toString()) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    const deletedAt = new Date();
    await this.messageModel.updateOne(
      { _id: message._id },
      { deleted: true, deletedAt },
    );

    const conversation = await this.conversationModel
      .findById(message.conversationId)
      .lean();

    // If the deleted message was the thread's preview, replace it with the
    // previous non-deleted message so the conversation list behaves like
    // WhatsApp (deleted message text is not shown as the last message).
    if (
      conversation &&
      conversation.lastMessage?.toString() === message._id.toString()
    ) {
      const previousMessage = await this.messageModel
        .findOne({
          conversationId: message.conversationId,
          _id: { $ne: message._id },
          deleted: { $ne: true },
        })
        .sort({ createdAt: -1 })
        .lean();

      await this.conversationModel.updateOne(
        { _id: conversation._id },
        {
          lastMessage: previousMessage?._id || null,
          lastMessageText: previousMessage?.text || null,
          lastMessageAt: previousMessage?.createdAt || null,
        },
      );
    }

    return {
      conversationId: message.conversationId,
      messageId: message._id,
      deletedBy: userId,
      deletedAt,
      participantUserIds: (conversation?.participants || []).map((p) =>
        p.toString(),
      ),
    };
  }

  async deleteConversation(userId: string, conversationId: string) {
    const me = new Types.ObjectId(userId);
    const conversation = await this.conversationModel.findById(conversationId).lean();
    if (!conversation) throw new NotFoundException('Conversation not found');

    const participants = (conversation.participants || []).map((p: any) => p.toString());
    if (!participants.includes(me.toString())) {
      throw new ForbiddenException('You are not a participant of this conversation');
    }

    await this.messageModel.deleteMany({ conversationId: new Types.ObjectId(conversationId) });
    await this.conversationModel.deleteOne({ _id: new Types.ObjectId(conversationId) });

    return { conversationId, deletedBy: userId };
  }

  // ============================================================
  // VIEW MAPPERS
  // ============================================================

  private toConversationView(conversation: any, otherUser?: any) {
    return {
      _id: conversation._id,
      type: conversation.type,
      participants: conversation.participants,
      otherUser: otherUser
        ? {
            _id: otherUser._id,
            name: otherUser.name,
            lastName: otherUser.lastName,
            specialId: otherUser.specialId,
            role: otherUser.role,
            image: otherUser.image,
            department: otherUser.department,
            isHod: otherUser.isHod,
            isPrincipal: otherUser.isPrincipal,
          }
        : null,
      lastMessageText: conversation.lastMessageText || null,
      lastMessageAt: conversation.lastMessageAt || null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private toMessageView(message: MessageDocument) {
    const isDeleted = !!message.deleted;
    return {
      _id: message._id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      text: isDeleted ? '' : message.text,
      replyTo: message.replyTo || null,
      deleted: isDeleted,
      deletedAt: message.deletedAt || null,
      readBy: message.readBy,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }
}