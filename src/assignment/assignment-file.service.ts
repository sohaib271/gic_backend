/**
 * 📎 ASSIGNMENT FILE SERVICE
 * ==========================
 * Stores assignment attachments and student submission files in GridFS.
 *
 * Uploads are memory-buffered (10 MB cap) and only their ids are handed back
 * to the client. The assignment service then resolves those ids and checks
 * that the uploader is the same user, so a student can never attach a file
 * somebody else uploaded.
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
import {
  ASSIGNMENT_ALLOWED_MIME_TYPES,
  ASSIGNMENT_MAX_FILE_BYTES,
  ASSIGNMENT_MAX_FILES,
} from './assignment.constants';

export type StoredFile = {
  fileId: Types.ObjectId;
  name: string;
  mime: string;
  size: number;
};

@Injectable()
export class AssignmentFileService {
  private readonly logger = new Logger(AssignmentFileService.name);
  private bucket: mongo.GridFSBucket | null = null;

  constructor(@InjectConnection() private readonly connection: Connection) {}

  private getBucket(): mongo.GridFSBucket {
    if (!this.bucket) {
      if (!this.connection.db) {
        throw new ServiceUnavailableException('Database not connected yet');
      }
      this.bucket = new mongo.GridFSBucket(this.connection.db, {
        bucketName: 'assignment_files',
      });
    }
    return this.bucket;
  }

  /** Validates and stores one upload, returning its attachment descriptor. */
  async save(uploaderId: string, file: Express.Multer.File): Promise<StoredFile> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Uploaded file is empty');
    }

    if (file.size > ASSIGNMENT_MAX_FILE_BYTES) {
      throw new BadRequestException(
        `"${file.originalname}" is larger than 10 MB`,
      );
    }

    const mime = (file.mimetype || 'application/octet-stream').toLowerCase();
    if (!ASSIGNMENT_ALLOWED_MIME_TYPES.includes(mime)) {
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

  /**
   * Resolves client-provided file ids into trusted attachment descriptors.
   * Every id must exist in GridFS and belong to the caller.
   */
  async resolveOwned(
    uploaderId: string,
    fileIds: string[],
  ): Promise<StoredFile[]> {
    if (!fileIds?.length) return [];

    if (fileIds.length > ASSIGNMENT_MAX_FILES) {
      throw new BadRequestException(
        `You can attach at most ${ASSIGNMENT_MAX_FILES} files`,
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

  /** Reads metadata for one GridFS file, or null when it does not exist. */
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

  async remove(fileId: string | Types.ObjectId | null | undefined) {
    if (!fileId) return;
    const id =
      typeof fileId === 'string' ? fileId : fileId.toString();
    if (!Types.ObjectId.isValid(id)) return;

    try {
      await this.getBucket().delete(new mongo.ObjectId(id));
    } catch (error) {
      // A missing file is fine — deletion is best effort.
      this.logger.warn(`Could not delete assignment file ${id}: ${error}`);
    }
  }

  private sanitizeName(name: string): string {
    const base = String(name || 'attachment')
      .replace(/[\\/]+/g, '_')
      .replace(/[\u0000-\u001f]/g, '')
      .trim();
    return (base || 'attachment').slice(0, 120);
  }
}
