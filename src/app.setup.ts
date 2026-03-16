import { INestApplication, VersioningType } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { RedocModule, RedocOptions } from 'nestjs-redoc';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { config } from './config/config';

export async function configureApplication(
  app: INestApplication | NestExpressApplication,
): Promise<void> {
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true, limit: '25mb' }));

  app.enableCors({
    origin: config.app.corsOrigin,
    credentials: true,
  });

  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'v',
    defaultVersion: config.app.apiVersion,
  });

  app.setGlobalPrefix(config.app.apiPrefix);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  await setupDocumentation(app as NestExpressApplication);
}

async function setupDocumentation(app: NestExpressApplication): Promise<void> {
  const swaggerConfig = new DocumentBuilder()
    .setTitle(config.app.name)
    .setDescription(config.app.description)
    .setVersion(`v${config.app.apiVersion}`)
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
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup(config.docs.swaggerPath, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'method',
    },
  });

  const redocOptions: RedocOptions = {
    title: `${config.app.name} Reference`,
    sortPropsAlphabetically: true,
    hideDownloadButton: false,
    hideHostname: false,
  };

  await RedocModule.setup(config.docs.redocPath, app, document, redocOptions);
}
