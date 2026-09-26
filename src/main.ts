import { NestFactory } from '@nestjs/core';
import dotenv from 'dotenv';
dotenv.config();
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { XssSanitizePipe } from './others-stuff/pipes/xss-sanitize.pipe';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Render/Heroku route traffic through a proxy - trust it so req.ip and
  // rate limiting see the real client IP instead of the proxy's.
  app.set('trust proxy', 1);

  // Serve static files from public folder
  app.useStaticAssets(join(__dirname, '..', 'public'));

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", process.env.PRODUCTION_URL, process.env.DEVELOPMENT_URL].filter(
            Boolean,
          ) as string[],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  // Enable validation
  app.useGlobalPipes(
    new XssSanitizePipe(),
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.enableCors({
    origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    const allowedOrigins = [
      process.env.PRODUCTION_URL,
      process.env.DEVELOPMENT_URL,
      'http://localhost:8080',
      'http://127.0.0.1:8080',
    ];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: 'Content-Type, Authorization',
  credentials: true
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('GIC Backend API')
    .setDescription('API documentation for the GIC backend project')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document);

  // Health check endpoint (used by Render). Kept free of DB/auth so the port
  // scan + health check pass as soon as the server is bound.
  app.getHttpAdapter().get('/health', (_req: any, res: any) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
  });

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';

  // MUST bind to 0.0.0.0: Render injects PORT and only detects a service that
  // listens on all interfaces. Listening on localhost/3000 = "port scan timeout".
  await app.listen(port, host);
  logger.log(`Server listening on http://${host}:${port}`);
}

bootstrap().catch((error) => {
  logger.error(`Failed to start server: ${error?.message || error}`, error?.stack);
  process.exit(1);
});
