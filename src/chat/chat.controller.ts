import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
import { Logger, NotFoundException } from '@nestjs/common';
import { AuthGuard } from 'src/others-stuff/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatFileService } from './chat-file.service';
import {
  CreateConversationDto,
  GetMessagesQueryDto,
  SendMessageDto,
} from './chat.dto';

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private chatService: ChatService,
    private chatGateway: ChatGateway,
    private chatFileService: ChatFileService,
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
      dto.attachments,
    );
  }

  // ============================================================
  // FILES
  // ============================================================

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  uploadFile(@Request() req, @UploadedFile() file: Express.Multer.File) {
    return this.chatFileService.save(req.user.sub, file).then((stored) => ({
      fileId: stored.fileId.toString(),
      name: stored.name,
      mime: stored.mime,
      size: stored.size,
    }));
  }

  @Get('files/:fileId')
  async downloadFile(
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const file = await this.chatFileService.find(fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    const stream = await this.chatFileService.stream(fileId);
    res.setHeader('Content-Type', file.mime || 'application/octet-stream');
    res.setHeader('Content-Length', String(file.size));
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );

    stream.on('error', (error) => {
      this.logger.error(`Chat file stream failed: ${error}`);
      if (!res.headersSent) {
        res.status(404).json({ message: 'File not found' });
      } else {
        res.end();
      }
    });

    stream.pipe(res);
  }

  @Delete('messages/:messageId')
  async deleteMessage(@Request() req, @Param('messageId') messageId: string) {
    return this.chatService.deleteMessage(req.user.sub, messageId);
  }

  @Delete('conversations/:conversationId')
  async deleteConversation(@Request() req, @Param('conversationId') conversationId: string) {
    return this.chatService.deleteConversation(req.user.sub, conversationId);
  }
}