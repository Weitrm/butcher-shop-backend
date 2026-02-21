import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Request, Response } from 'express';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const httpServer = app.getHttpAdapter().getInstance();

  app.setGlobalPrefix('api');

  app.enableCors();

  httpServer.get('/', (_req: Request, res: Response) => {
    return res.status(200).json({ status: 'ok', service: 'butcher-api' });
  });

  httpServer.get('/health', (_req: Request, res: Response) => {
    return res.status(200).json({ status: 'ok' });
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  );

  const config = new DocumentBuilder()
    .setTitle('Butcher RESTFul API')
    .setDescription('Butcher shop endpoints')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);


  await app.listen(process.env.PORT);
  logger.log('Build marker: serve-static-removed-2026-02-21');
  logger.log(`App running on port ${ process.env.PORT }`);
}
bootstrap();
