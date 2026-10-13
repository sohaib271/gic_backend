import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import {
  CreateConversationDto,
  GetMessagesQueryDto,
  SendMessageDto,
} from './chat.dto';

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(
    private chatService: ChatService,
    private chatGateway: ChatGateway,
  ) {}

  @Get('contacts')
  async getContacts(@Request() req, @Query('q') q?: string) {
    return this.chatService.getContacts(req.user.sub, q);
  }

  @Get('conversations')
  async getMyConversations(@Request() req) {
    return this.chatService.getMyConversations(req.user.sub);
  }

  @Post('conversations')
  async createConversation(
    @Request() req,
    @Body() dto: CreateConversationDto,
  ) {
    const user = await this.chatService.getRawUser(req.user.sub);
    return this.chatService.getOrCreateConversation(user, dto.receiverId);
  }

  @Get('conversations/:conversationId/messages')
  async getMessages(
    @Request() req,
    @Param('conversationId') conversationId: string,
    @Query() query: GetMessagesQueryDto,
  ) {
    const page = parseInt(query.page || '1', 10) || 1;
    const limit = parseInt(query.limit || '30', 10) || 30;
    return this.chatService.getMessages(
      req.user.sub,
      conversationId,
      page,
      limit,
    );
  }

  @Patch('conversations/:conversationId/read')
  async markAsRead(
    @Request() req,
    @Param('conversationId') conversationId: string,
  ) {
    const result = await this.chatService.markAsRead(
      req.user.sub,
      conversationId,
    );
    // Emit the read event right here (not just via the socket handler) so the
    // sender's app learns the messages were read even when the reader went
    // through the REST /read endpoint.
    this.chatGateway.notifyMessagesRead(
      conversationId,
      req.user.sub,
      result.participantUserIds,
    );
    return result;
  }

  @Post('messages')
  async sendMessage(@Request() req, @Body() dto: SendMessageDto) {
    const user = await this.chatService.getRawUser(req.user.sub);
    return this.chatService.createMessage(
      user,
      dto.receiverId,
      dto.text,
      dto.replyToMessageId,
    );
  }

  @Delete('messages/:messageId')
  async deleteMessage(@Request() req, @Param('messageId') messageId: string) {
    return this.chatService.deleteMessage(req.user.sub, messageId);
  }
}