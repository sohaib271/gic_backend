import {
  Body,
  Controller,
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
import {
  CreateConversationDto,
  GetMessagesQueryDto,
  SendMessageDto,
} from './chat.dto';

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

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
    return this.chatService.markAsRead(req.user.sub, conversationId);
  }

  @Post('messages')
  async sendMessage(@Request() req, @Body() dto: SendMessageDto) {
    const user = await this.chatService.getRawUser(req.user.sub);
    return this.chatService.createMessage(user, dto.receiverId, dto.text);
  }
}