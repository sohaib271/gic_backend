import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from './conversation.schema';
import { Message, MessageDocument } from './message.schema';
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

  async getOrCreateConversation(user: any, receiverId: string) {
    const receiver = await this.userModel.findById(receiverId).lean();
    if (!receiver) throw new NotFoundException('Receiver not found');

    if (!this.canChat(user.role, receiver.role)) {
      throw new ForbiddenException('Students are not allowed to chat with other students');
    }

    const meId = new Types.ObjectId(user._id.toString());
    const otherId = new Types.ObjectId(receiverId);

    let conversation = await this.conversationModel
      .findOne({
        type: 'direct',
        participants: { $size: 2, $all: [meId, otherId] },
      })
      .lean();

    if (!conversation) {
      conversation = await this.conversationModel.create({
        type: 'direct',
        creatorId: meId,
        participants: [meId, otherId],
      });
    }

    const other = await this.userModel
      .findById(receiverId)
      .select(USER_SELECT)
      .lean();

    return {
      conversation: this.toConversationView(conversation, other),
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

      result.push({
        conversation: this.toConversationView(c, otherUser),
        lastMessage,
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
      messages: messages.reverse(),
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
    };
  }

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  async createMessage(sender: any, receiverId: string, text: string) {
    const receiver = await this.userModel.findById(receiverId).lean();
    if (!receiver) throw new NotFoundException('Receiver not found');

    if (!this.canChat(sender.role, receiver.role)) {
      throw new ForbiddenException('Students are not allowed to chat with other students');
    }

    const { conversation } = await this.getOrCreateConversation(sender, receiverId);

    const message = await this.messageModel.create({
      conversationId: conversation._id,
      senderId: new Types.ObjectId(sender._id.toString()),
      text: text.trim(),
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

    const otherUser = await this.userModel
      .findById(receiverId)
      .select(USER_SELECT)
      .lean();

    return {
      conversation: this.toConversationView(conversation, otherUser),
      message: this.toMessageView(message),
    };
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
    return {
      _id: message._id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      text: message.text,
      readBy: message.readBy,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }
}