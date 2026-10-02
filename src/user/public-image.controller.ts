import {
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import type * as express from 'express';
// NOT `import type` — Nest reads the constructor's emitted design:paramtypes to
// resolve ImageService, and a type-only import erases it at compile time, which
// fails at boot with UnknownDependenciesException. `express.Response` is
// type-only the other way around: it is a decorated signature, not injected.
import { ImageService } from './image.service';

@Controller('users/image')
export class PublicImageController {
  private readonly logger = new Logger(PublicImageController.name);

  constructor(private readonly imageService: ImageService) {}

  @Get(':fileId')
  async serve(@Param('fileId') fileId: string, @Res() res: express.Response) {
    const meta = await this.imageService.meta(fileId);
    if (!meta) throw new NotFoundException('Image not found');

    res.setHeader('Content-Type', meta.metadata?.mime ?? 'application/octet-stream');
    res.setHeader('Content-Length', meta.length);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    const stream = await this.imageService.stream(fileId);
    stream.on('error', (error) => {
      this.logger.error(`Stream failed for image ${fileId}: ${error?.message}`);
      if (!res.headersSent) res.status(404).json({ message: 'Image not found' });
      else res.end();
    });
    stream.pipe(res);
  }
}
