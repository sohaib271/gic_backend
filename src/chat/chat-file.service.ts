/**
 * 📎 CHAT FILE SERVICE
 * ====================
 * Stores chat attachments (images, PDFs, etc.) in GridFS.
 * Reuses the same pattern as AssignmentFileService.
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types, mongo } from 'mongoose';

export type StoredFile = {
  fileId: Types.ObjectId;
  name: string;
  mime: string;
  size: number;
};

const CHAT_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const CHAT_MAX_FILES = 5;
const CHAT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

@Injectable()
export class ChatFileService {
  private readonly logger = new Logger(ChatFileService.name);
  private bucket: mongo.GridFSBucket | null = null;

  constructor(@InjectConnection() private readonly connection: Connection) {}

  private getBucket(): mongo.GridFSBucket {
    if (!this.bucket) {
      if (!this.connection.db) {
        throw new ServiceUnavailableException('Database not connected yet');
      }
      this.bucket = new mongo.GridFSBucket(this.connection.db, {
        bucketName: 'chat_files',
      });
    }
    return this.bucket;
  }

  async save(uploaderId: string, file: Express.Multer.File): Promise<StoredFile> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Uploaded file is empty');
    }

    if (file.size > CHAT_MAX_FILE_BYTES) {
      throw new BadRequestException(
        `"${file.originalname}" is larger than 10 MB`,
      );
    }

    const mime = (file.mimetype || 'application/octet-stream').toLowerCase();
    if (!CHAT_ALLOWED_MIME_TYPES.includes(mime)) {
      throw new BadRequestException(`File type not allowed: ${mime}`);
    }

    const name = this.sanitizeName(file.originalname);
    const id = new mongo.ObjectId();

    await new Promise<void>((resolve, reject) => {
      const stream = this.getBucket().openUploadStreamWithId(id, name, {
        metadata: {
          mime,
          uploaderId,
          uploadedAt: new Date(),
        },
      });
      stream.on('error', reject);
      stream.on('finish', () => resolve());
      stream.end(file.buffer);
    });

    return { fileId: id, name, mime, size: file.size };
  }

  async resolveOwned(
    uploaderId: string,
    fileIds: string[],
  ): Promise<StoredFile[]> {
    if (!fileIds?.length) return [];

    if (fileIds.length > CHAT_MAX_FILES) {
      throw new BadRequestException(
        `You can attach at most ${CHAT_MAX_FILES} files`,
      );
    }

    const unique = [...new Set(fileIds)];
    if (unique.length !== fileIds.length) {
      throw new BadRequestException('Duplicate file ids are not allowed');
    }

    const bucket = this.getBucket();
    const files: StoredFile[] = [];

    for (const rawId of unique) {
      if (!Types.ObjectId.isValid(rawId)) {
        throw new BadRequestException('Invalid file id');
      }

      const objectId = new mongo.ObjectId(rawId);
      const stored = await bucket.find({ _id: objectId }).next();

      if (!stored) {
        throw new NotFoundException('Attached file was not found');
      }

      if (stored.metadata?.uploaderId !== uploaderId) {
        throw new ForbiddenException('You can only attach your own uploads');
      }

      files.push({
        fileId: objectId,
        name: stored.filename || 'attachment',
        mime: stored.metadata?.mime || 'application/octet-stream',
        size: stored.length ?? 0,
      });
    }

    return files;
  }

  async find(fileId: string) {
    if (!Types.ObjectId.isValid(fileId)) return null;
    const objectId = new mongo.ObjectId(fileId);
    const stored = await this.getBucket().find({ _id: objectId }).next();
    if (!stored) return null;
    return {
      fileId: objectId,
      name: stored.filename || 'attachment',
      mime: stored.metadata?.mime || 'application/octet-stream',
      size: stored.length ?? 0,
    };
  }

  async stream(fileId: string) {
    if (!Types.ObjectId.isValid(fileId)) {
      throw new NotFoundException('File not found');
    }
    return this.getBucket().openDownloadStream(new mongo.ObjectId(fileId));
  }

  private sanitizeName(name: string): string {
    const base = String(name || 'attachment')
      .replace(/[\\/]+/g, '_')
      .replace(/[\u0000-\u001f]/g, '')
      .trim();
    return (base || 'attachment').slice(0, 120);
  }
}