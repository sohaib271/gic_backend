import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SocketSendMessageDto {
  @IsString()
  @IsNotEmpty()
  senderId: string;

  @IsString()
  @IsNotEmpty()
  receiverId: string;

  @IsString()
  @IsNotEmpty()
  text: string;
}

export class SocketTypingDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsBoolean()
  @IsOptional()
  isTyping?: boolean;
}

export class SocketReadMessagesDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  conversationId: string;
}

export class CreateConversationDto {
  @IsString()
  @IsNotEmpty()
  receiverId: string;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  receiverId: string;

  @IsString()
  @IsNotEmpty()
  text: string;
}

export class GetMessagesQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}