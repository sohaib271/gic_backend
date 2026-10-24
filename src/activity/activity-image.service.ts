import { Injectable, Logger, BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types, mongo } from 'mongoose';
import sharp from 'sharp';

@Injectable()
export class ActivityImageService {
  private readonly logger = new Logger(ActivityImageService.name);
  private bucket: mongo.GridFSBucket | null = null;

  constructor(@InjectConnection() private readonly connection: Connection) {}

  private getBucket(): mongo.GridFSBucket {
    if (!this.bucket) {
      if (!this.connection.db) throw new ServiceUnavailableException('Database not connected yet');
      this.bucket = new mongo.GridFSBucket(this.connection.db, { bucketName: 'activity_images' });
    }
    return this.bucket;
  }

  async save(buffer: Buffer): Promise<{ id: string; size: number }> {
    if (!buffer?.length) throw new BadRequestException('Image file is empty');
    const compressed = await sharp(buffer).rotate().webp({ quality: 82 }).toBuffer();
    const id = new mongo.ObjectId();
    await new Promise<void>((resolve, reject) => {
      const stream = this.getBucket().openUploadStreamWithId(id, `${id}.webp`, { metadata: { mime: 'image/webp', uploadedAt: new Date() } });
      stream.on('error', reject);
      stream.on('finish', () => resolve());
      stream.end(compressed);
    });
    return { id: id.toString(), size: compressed.length };
  }

  async stream(fileId: string) {
    if (!Types.ObjectId.isValid(fileId)) throw new NotFoundException('Image not found');
    return this.getBucket().openDownloadStream(new mongo.ObjectId(fileId));
  }
}
