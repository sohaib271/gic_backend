import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dns from "dns"

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

   dns.setDefaultResultOrder("ipv4first");

   app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Authorization',
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
