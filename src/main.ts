import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApplication } from './app.setup';
import { config } from './config/config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  await configureApplication(app);
  await app.listen(config.app.port);
}

void bootstrap();
