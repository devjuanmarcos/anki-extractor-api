import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { config } from '../src/config/config';

async function exportOpenApi(): Promise<void> {
  const outputPath = resolve(
    process.cwd(),
    process.argv[2] ?? 'docs/insomnia-openapi.json',
  );

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
  });

  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'v',
    defaultVersion: config.app.apiVersion,
  });
  app.setGlobalPrefix(config.app.apiPrefix);

  await app.init();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle(config.app.name)
      .setDescription(config.app.description)
      .setVersion(`v${config.app.apiVersion}`)
      .addServer(`http://localhost:${config.app.port}`, 'Local development')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Use the access token returned by the authentication endpoints.',
        },
        'bearer',
      )
      .build(),
  );

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  await app.close();
  process.stdout.write(`OpenAPI exported to ${outputPath}\n`);
}

void exportOpenApi();
