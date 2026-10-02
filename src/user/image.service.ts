import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types, mongo } from 'mongoose';
import sharp from 'sharp';

@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name);

  private static readonly OUTPUT_SIZE = 400;
  private static readonly OUTPUT_MIME = 'image/webp';
  private static readonly OUTPUT_QUALITY = 82;

  private bucket: mongo.GridFSBucket | null = null;

  constructor(@InjectConnection() private readonly connection: Connection) {}

  private getBucket(): mongo.GridFSBucket {
    if (!this.bucket) {
      if (!this.connection.db) {
        throw new ServiceUnavailableException('Database not connected yet');
      }
      this.bucket = new mongo.GridFSBucket(this.connection.db, { bucketName: 'images' });
    }
    return this.bucket;
  }

  private async compress(buffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(buffer)
        .rotate()
        .resize(ImageService.OUTPUT_SIZE, ImageService.OUTPUT_SIZE, {
          fit: 'cover',
          position: 'centre',
        })
        .webp({ quality: ImageService.OUTPUT_QUALITY })
        .toBuffer();
    } catch (error) {
      this.logger.warn(`Image compression failed: ${error?.message}`);
      throw new BadRequestException('File is not a valid image');
    }
  }

  async save(buffer: Buffer, userId: string): Promise<{ id: string; size: number }> {
    if (!buffer?.length) {
      throw new BadRequestException('Image file is empty');
    }

    const compressed = await this.compress(buffer);
    const id = new mongo.ObjectId();

    await new Promise<void>((resolve, reject) => {
      const stream = this.getBucket().openUploadStreamWithId(id, `${id}.webp`, {
        metadata: {
          mime: ImageService.OUTPUT_MIME,
          userId,
          uploadedAt: new Date(),
        },
      });
      stream.on('error', reject);
      stream.on('finish', () => resolve());
      stream.end(compressed);
    });

    this.logger.log(
      `Stored profile image ${id} for user ${userId} (${compressed.length} bytes)`,
    );
    return { id: id.toString(), size: compressed.length };
  }

  async meta(fileId: string): Promise<{ length: number; metadata: any } | null> {
    if (!Types.ObjectId.isValid(fileId)) return null;
    const file = await this.getBucket()
      .find({ _id: new mongo.ObjectId(fileId) })
      .next();
    if (!file) return null;
    return { length: file.length as number, metadata: file.metadata };
  }

  async stream(fileId: string) {
    const found = await this.meta(fileId);
    if (!found) throw new NotFoundException('Image not found');
    return this.getBucket().openDownloadStream(new mongo.ObjectId(fileId));
  }

  async remove(fileId: string | null | undefined): Promise<void> {
    if (!fileId || !Types.ObjectId.isValid(fileId)) return;
    try {
      await this.getBucket().delete(new mongo.ObjectId(fileId));
      this.logger.log(`Deleted image ${fileId}`);
    } catch (error) {
      this.logger.warn(`Could not delete image ${fileId}: ${error?.message}`);
    }
  }

  extractId(imageUrl: string | null | undefined): string | null {
    if (!imageUrl) return null;
    const match = /\/users\/image\/([a-f\d]{24})\/?$/i.exec(imageUrl);
    return match ? match[1] : null;
  }
}
